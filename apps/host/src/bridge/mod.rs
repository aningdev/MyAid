//! Bridge: the Runner's side of the relay tunnel.
//!
//! Owns the registration key, the X25519 static key, the Relay connection, the
//! one-time pairing psk, and the paired-Device file. Noise transport beyond
//! stream 0 is refused. The frame contract is `docs/architecture/relay-tunnel.md`.
//!
//! Lock order: `pairing`, then `devices`, then `online`. `identity` and `link`
//! are not part of that order.

mod channel;
mod devices;
mod disk;
mod encode;
mod frames;
mod identity;
mod link;
mod noise;

#[cfg(test)]
mod tests;

use crate::{Config, Result};
use channel::Inbound;
use devices::Record;
use serde::Serialize;
#[cfg(test)]
use std::path::Path;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
use tokio::sync::mpsc::UnboundedSender;
use url::Url;

/// Placeholder until the project picks a real default Relay. Bridge does not dial it.
pub const DEFAULT_RELAY_URL: &str = "https://default-relay-url.invalid";

const PSK_TTL_SECS: u64 = 5 * 60;

#[derive(Debug)]
pub enum IssueError {
    /// No usable Relay address, so a pairing link cannot be made.
    Unavailable(String),
    Failed(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingTicket {
    pub link: String,
    pub expires_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicesBody {
    pub devices: Vec<DeviceView>,
    pub relay: RelayView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub device_id: String,
    pub name: String,
    pub platform: String,
    pub paired_at: u64,
    pub last_seen_at: u64,
    pub online: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayView {
    pub configured: bool,
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runner_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone)]
enum RelayPlan {
    Down { reason: String },
    Up { ws: Url, origin: String },
}

struct Psk {
    generation: u64,
    bytes: [u8; 32],
    expires_at: u64,
    in_use: bool,
}

struct DeviceMemory {
    records: Vec<Record>,
    error: Option<String>,
}

struct OnlineSession {
    session_id: u64,
    tx: UnboundedSender<Inbound>,
}

struct LinkState {
    connected: bool,
    reason: Option<String>,
}

struct Shared {
    dir: PathBuf,
    plan: RelayPlan,
    now: Arc<dyn Fn() -> u64 + Send + Sync>,
    identity: Mutex<Option<identity::Identity>>,
    devices: Mutex<DeviceMemory>,
    pairing: Mutex<Option<Psk>>,
    psk_generation: AtomicU64,
    online: Mutex<HashMap<String, Vec<OnlineSession>>>,
    session_ids: AtomicU64,
    list_generation: AtomicU64,
    link: Mutex<LinkState>,
}

#[derive(Clone)]
pub struct Bridge {
    shared: Arc<Shared>,
}

pub(super) struct Session {
    bridge: Bridge,
    device_id: String,
    session_id: u64,
}

impl Session {
    pub(super) fn device_id(&self) -> &str {
        &self.device_id
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.bridge.unregister(&self.device_id, self.session_id);
    }
}

impl Bridge {
    pub fn open(config: &Config) -> Result<Self> {
        let setting = std::env::var("DSH_BOT_RELAY_URL").ok();
        Ok(Self::build(
            config.root.join("host/bridge"),
            setting.as_deref(),
            Arc::new(crate::now),
        ))
    }

    #[cfg(test)]
    fn open_for_test(root: &Path, relay: Option<&str>, now: Arc<AtomicU64>) -> Self {
        let clock = now.clone();
        Self::build(
            root.join("host/bridge"),
            relay,
            Arc::new(move || clock.load(Ordering::Relaxed)),
        )
    }

    fn build(dir: PathBuf, relay: Option<&str>, now: Arc<dyn Fn() -> u64 + Send + Sync>) -> Self {
        let plan = plan_from(relay);
        let (records, error) = match devices::load(&dir.join("devices.json")) {
            Ok(records) => (records, None),
            Err(error) => (Vec::new(), Some(error)),
        };
        let reason = if matches!(plan, RelayPlan::Up { .. }) {
            Some("connecting".into())
        } else {
            None
        };
        Self {
            shared: Arc::new(Shared {
                dir,
                plan,
                now,
                identity: Mutex::new(None),
                devices: Mutex::new(DeviceMemory { records, error }),
                pairing: Mutex::new(None),
                psk_generation: AtomicU64::new(0),
                online: Mutex::new(HashMap::new()),
                session_ids: AtomicU64::new(1),
                list_generation: AtomicU64::new(0),
                link: Mutex::new(LinkState {
                    connected: false,
                    reason,
                }),
            }),
        }
    }

    pub fn spawn(&self, stop: Arc<AtomicBool>) {
        let bridge = self.clone();
        tokio::spawn(async move { link::run(bridge, stop).await });
    }

    pub fn issue_pairing(&self) -> std::result::Result<PairingTicket, IssueError> {
        self.gate()?;
        let identity = self.identity().map_err(IssueError::Failed)?;
        let RelayPlan::Up { origin, .. } = &self.shared.plan else {
            return Err(IssueError::Unavailable(unset_reason()));
        };
        let origin = origin.clone();
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|error| IssueError::Failed(error.to_string()))?;
        let expires_at = (self.shared.now)().saturating_add(PSK_TTL_SECS);
        let generation = self.shared.psk_generation.fetch_add(1, Ordering::Relaxed) + 1;
        *lock(&self.shared.pairing) = Some(Psk {
            generation,
            bytes,
            expires_at,
            in_use: false,
        });
        Ok(PairingTicket {
            link: pairing_link(
                &origin,
                &identity.runner_id,
                identity.static_public(),
                &bytes,
                expires_at,
            ),
            expires_at,
        })
    }

    pub fn devices(&self) -> Result<DevicesBody> {
        if let Some(error) = lock(&self.shared.devices).error.clone() {
            return Err(error);
        }
        Ok(self.snapshot())
    }

    pub fn generation(&self) -> u64 {
        self.shared.list_generation.load(Ordering::Acquire)
    }

    /// `/watch` frame for a device-list change. Status frames stay unchanged.
    pub fn devices_event(&self) -> Result<String> {
        let body = self.devices()?;
        Ok(serde_json::json!({
            "event": "bridge.devices",
            "devices": body.devices,
        })
        .to_string())
    }

    pub fn revoke(&self, device_id: &str) -> Result<Option<DevicesBody>> {
        if let Some(error) = lock(&self.shared.devices).error.clone() {
            return Err(error);
        }
        let senders = {
            let mut devices = lock(&self.shared.devices);
            let Some(index) = devices
                .records
                .iter()
                .position(|record| record.device_id == device_id)
            else {
                return Ok(None);
            };
            let removed = devices.records.remove(index);
            if let Err(error) = devices::save(&self.devices_path(), &devices.records) {
                devices.records.insert(index, removed);
                return Err(error);
            }
            let mut online = lock(&self.shared.online);
            online.remove(device_id).unwrap_or_default()
        };
        self.bump();
        for session in senders {
            let _ = session.tx.send(Inbound::Revoke);
        }
        Ok(Some(self.snapshot()))
    }

    fn gate(&self) -> std::result::Result<(), IssueError> {
        if let Some(error) = lock(&self.shared.devices).error.clone() {
            return Err(IssueError::Failed(error));
        }
        if let RelayPlan::Down { reason } = &self.shared.plan {
            return Err(IssueError::Unavailable(reason.clone()));
        }
        Ok(())
    }

    fn identity(&self) -> Result<identity::Identity> {
        let mut slot = lock(&self.shared.identity);
        if let Some(identity) = slot.as_ref() {
            return Ok(identity.clone());
        }
        let identity = identity::load_or_create(&self.shared.dir)?;
        *slot = Some(identity.clone());
        Ok(identity)
    }

    fn runner_url(&self) -> Option<Url> {
        match &self.shared.plan {
            RelayPlan::Up { ws, .. } => Some(ws.clone()),
            RelayPlan::Down { .. } => None,
        }
    }

    fn devices_unreadable(&self) -> bool {
        lock(&self.shared.devices).error.is_some()
    }

    fn set_link(&self, connected: bool, reason: Option<String>) {
        let mut link = lock(&self.shared.link);
        link.connected = connected;
        link.reason = reason;
    }

    fn checkout_psk(&self) -> Option<(u64, [u8; 32])> {
        let mut slot = lock(&self.shared.pairing);
        let now = (self.shared.now)();
        let psk = slot.as_mut()?;
        if now >= psk.expires_at {
            *slot = None;
            return None;
        }
        if psk.in_use {
            return None;
        }
        psk.in_use = true;
        Some((psk.generation, psk.bytes))
    }

    fn release_psk(&self, generation: u64) {
        let mut slot = lock(&self.shared.pairing);
        if let Some(psk) = slot.as_mut()
            && psk.generation == generation
        {
            psk.in_use = false;
        }
    }

    fn enroll(
        &self,
        generation: u64,
        remote: [u8; 32],
        name: String,
        platform: String,
        tx: UnboundedSender<Inbound>,
    ) -> Result<Session> {
        let now = (self.shared.now)();
        let device_id = encode::public_id(&remote);
        let mut pairing = lock(&self.shared.pairing);
        let mut devices = lock(&self.shared.devices);
        let previous = devices.records.clone();
        upsert(
            &mut devices.records,
            Record {
                device_id: device_id.clone(),
                public_key: remote,
                name,
                platform,
                paired_at: now,
                last_seen_at: now,
            },
        );
        if let Err(error) = devices::save(&self.devices_path(), &devices.records) {
            devices.records = previous;
            return Err(error);
        }
        if pairing
            .as_ref()
            .is_some_and(|psk| psk.generation == generation)
        {
            *pairing = None;
        }
        drop(pairing);
        // `devices` stays held across the online insert (lock order).
        let session = self.insert_online(device_id, tx);
        drop(devices);
        self.bump();
        Ok(session)
    }

    fn begin_daily(&self, remote: [u8; 32], tx: UnboundedSender<Inbound>) -> Option<Session> {
        let now = (self.shared.now)();
        let device_id = encode::public_id(&remote);
        let mut devices = lock(&self.shared.devices);
        let record = devices
            .records
            .iter_mut()
            .find(|record| record.device_id == device_id)?;
        record.last_seen_at = now;
        if let Err(error) = devices::save(&self.devices_path(), &devices.records) {
            tracing::warn!(%error, "bridge devices");
        }
        let session = self.insert_online(device_id, tx);
        drop(devices);
        self.bump();
        Some(session)
    }

    /// Caller holds `devices`. Takes `online` next.
    fn insert_online(&self, device_id: String, tx: UnboundedSender<Inbound>) -> Session {
        let session_id = self.shared.session_ids.fetch_add(1, Ordering::Relaxed);
        lock(&self.shared.online)
            .entry(device_id.clone())
            .or_default()
            .push(OnlineSession { session_id, tx });
        Session {
            bridge: self.clone(),
            device_id,
            session_id,
        }
    }

    fn touch(&self, device_id: &str) {
        let now = (self.shared.now)();
        let mut devices = lock(&self.shared.devices);
        let Some(record) = devices
            .records
            .iter_mut()
            .find(|record| record.device_id == device_id)
        else {
            return;
        };
        if record.last_seen_at == now {
            return;
        }
        record.last_seen_at = now;
        if let Err(error) = devices::save(&self.devices_path(), &devices.records) {
            tracing::warn!(%error, "bridge devices");
        }
        drop(devices);
        self.bump();
    }

    fn unregister(&self, device_id: &str, session_id: u64) {
        let mut online = lock(&self.shared.online);
        let Some(list) = online.get_mut(device_id) else {
            return;
        };
        let before = list.len();
        list.retain(|session| session.session_id != session_id);
        if list.len() == before {
            return;
        }
        if list.is_empty() {
            online.remove(device_id);
        }
        drop(online);
        self.bump();
    }

    fn mark_all_offline(&self) {
        let mut online = lock(&self.shared.online);
        if online.is_empty() {
            return;
        }
        online.clear();
        drop(online);
        self.bump();
    }

    fn bump(&self) {
        self.shared.list_generation.fetch_add(1, Ordering::Release);
    }

    fn snapshot(&self) -> DevicesBody {
        let records = lock(&self.shared.devices).records.clone();
        let online = lock(&self.shared.online);
        let devices = records
            .iter()
            .map(|record| DeviceView {
                online: online
                    .get(&record.device_id)
                    .is_some_and(|sessions| !sessions.is_empty()),
                device_id: record.device_id.clone(),
                name: record.name.clone(),
                platform: record.platform.clone(),
                paired_at: record.paired_at,
                last_seen_at: record.last_seen_at,
            })
            .collect();
        drop(online);
        DevicesBody {
            devices,
            relay: self.relay_view(),
        }
    }

    fn relay_view(&self) -> RelayView {
        if let Some(error) = lock(&self.shared.devices).error.clone() {
            return RelayView {
                configured: matches!(self.shared.plan, RelayPlan::Up { .. }),
                connected: false,
                runner_id: None,
                reason: Some(error),
            };
        }
        if let RelayPlan::Down { reason } = &self.shared.plan {
            return RelayView {
                configured: false,
                connected: false,
                runner_id: None,
                reason: Some(reason.clone()),
            };
        }
        let link = lock(&self.shared.link);
        let runner_id = lock(&self.shared.identity)
            .as_ref()
            .map(|identity| identity.runner_id.clone());
        RelayView {
            configured: true,
            connected: link.connected,
            runner_id,
            reason: if link.connected {
                None
            } else {
                link.reason.clone()
            },
        }
    }

    fn devices_path(&self) -> PathBuf {
        self.shared.dir.join("devices.json")
    }
}

fn upsert(records: &mut Vec<Record>, record: Record) {
    if let Some(existing) = records
        .iter_mut()
        .find(|existing| existing.device_id == record.device_id)
    {
        *existing = record;
    } else {
        records.push(record);
    }
}

fn pairing_link(
    origin: &str,
    runner_id: &str,
    static_public: &[u8],
    psk: &[u8],
    expires_at: u64,
) -> String {
    format!(
        "{origin}/pair#v=1&r={runner_id}&k={}&p={}&e={expires_at}",
        encode::b64(static_public),
        encode::b64(psk),
    )
}

fn plan_from(setting: Option<&str>) -> RelayPlan {
    let Some(setting) = setting.map(str::trim).filter(|value| !value.is_empty()) else {
        return RelayPlan::Down {
            reason: unset_reason(),
        };
    };
    if setting == DEFAULT_RELAY_URL {
        return RelayPlan::Down {
            reason: unset_reason(),
        };
    }
    match endpoint(setting) {
        Ok((ws, origin)) => RelayPlan::Up { ws, origin },
        Err(reason) => RelayPlan::Down { reason },
    }
}

fn unset_reason() -> String {
    format!(
        "DSH_BOT_RELAY_URL is unset; DEFAULT_RELAY_URL ({DEFAULT_RELAY_URL}) is a placeholder, not a usable Relay"
    )
}

fn endpoint(setting: &str) -> Result<(Url, String)> {
    let mut url = Url::parse(setting)
        .map_err(|error| format!("DSH_BOT_RELAY_URL is not a usable Relay address: {error}"))?;
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_fragment(None);
    url.set_query(None);
    let (ws_scheme, http_scheme) = match url.scheme() {
        "wss" | "https" => ("wss", "https"),
        "ws" | "http" => ("ws", "http"),
        _ => {
            return Err("DSH_BOT_RELAY_URL scheme is not ws, wss, http, or https".into());
        }
    };
    let origin = http_origin(&url, http_scheme)?;
    url.set_scheme(ws_scheme)
        .map_err(|_| "DSH_BOT_RELAY_URL scheme".to_string())?;
    url.set_path("/v1/runner");
    Ok((url, origin))
}

fn http_origin(url: &Url, scheme: &str) -> Result<String> {
    let host = url
        .host_str()
        .ok_or("DSH_BOT_RELAY_URL has no host")?
        .to_string();
    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host
    };
    match url.port() {
        Some(port) => Ok(format!("{scheme}://{host}:{port}")),
        None => Ok(format!("{scheme}://{host}")),
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
