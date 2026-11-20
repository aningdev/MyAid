//! One Relay channel: Noise handshake, then stream 0 CONTROL. Every other stream
//! is reset with `forbidden`. Forwarding to dsh web is not this batch.

use super::{
    Bridge, Session,
    frames::{
        self, CLOSE_HANDSHAKE_FAILED, CLOSE_NORMAL, CLOSE_PAIRING_REJECTED, CONTROL, MODE_DAILY,
        MODE_PAIR, RESET,
    },
    noise,
};
use crate::Result;
use serde::Deserialize;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

pub(super) enum Inbound {
    Data(Vec<u8>),
    Closed,
    Revoke,
}

const NAME_LIMIT: usize = 256;

#[derive(Deserialize)]
struct PairHello {
    name: String,
    platform: String,
}

struct Live {
    transport: snow::TransportState,
    session: Session,
}

pub(super) async fn run(
    bridge: Bridge,
    channel: u32,
    tx: UnboundedSender<Inbound>,
    mut rx: UnboundedReceiver<Inbound>,
    outbound: UnboundedSender<Vec<u8>>,
) {
    let mut live: Option<Live> = None;
    while let Some(message) = rx.recv().await {
        match message {
            Inbound::Closed => break,
            Inbound::Revoke => {
                if let Some(current) = live.as_mut() {
                    let plain = frames::stream(0, CONTROL, br#"{"type":"revoked"}"#);
                    if let Ok(bytes) = noise::write_transport(&mut current.transport, &plain) {
                        let _ = outbound.send(frames::data(channel, &bytes));
                    }
                }
                let _ = outbound.send(frames::close(channel, CLOSE_NORMAL));
                break;
            }
            Inbound::Data(bytes) => {
                if live.is_none() {
                    match handshake(&bridge, channel, &tx, &bytes, &outbound) {
                        Ok(next) => live = Some(next),
                        Err(code) => {
                            let _ = outbound.send(frames::close(channel, code));
                            break;
                        }
                    }
                } else if let Some(current) = live.as_mut()
                    && on_transport(&bridge, current, channel, &bytes, &outbound).is_err()
                {
                    let _ = outbound.send(frames::close(channel, CLOSE_NORMAL));
                    break;
                }
            }
        }
    }
}

fn handshake(
    bridge: &Bridge,
    channel: u32,
    tx: &UnboundedSender<Inbound>,
    bytes: &[u8],
    outbound: &UnboundedSender<Vec<u8>>,
) -> std::result::Result<Live, u16> {
    let Some((mode, message)) = bytes.split_first() else {
        return Err(CLOSE_HANDSHAKE_FAILED);
    };
    match *mode {
        MODE_DAILY => daily(bridge, channel, tx, message, outbound),
        MODE_PAIR => pair(bridge, channel, tx, message, outbound),
        _ => Err(CLOSE_HANDSHAKE_FAILED),
    }
}

fn daily(
    bridge: &Bridge,
    channel: u32,
    tx: &UnboundedSender<Inbound>,
    message: &[u8],
    outbound: &UnboundedSender<Vec<u8>>,
) -> std::result::Result<Live, u16> {
    let identity = bridge.identity().map_err(|_| CLOSE_HANDSHAKE_FAILED)?;
    let mut handshake = noise::read_initiator(
        identity.static_private(),
        MODE_DAILY,
        &identity.runner_id,
        None,
        message,
    )
    .map_err(|_| CLOSE_HANDSHAKE_FAILED)?;
    let session = bridge.begin_daily(handshake.remote, tx.clone());
    let payload = if session.is_some() {
        br#"{"ok":true}"#.as_slice()
    } else {
        br#"{"error":"device-revoked"}"#.as_slice()
    };
    let second =
        noise::write_second(&mut handshake, payload).map_err(|_| CLOSE_HANDSHAKE_FAILED)?;
    let Some(session) = session else {
        let _ = outbound.send(frames::data(channel, &second));
        return Err(CLOSE_NORMAL);
    };
    let transport = noise::into_transport(handshake).map_err(|_| CLOSE_HANDSHAKE_FAILED)?;
    let _ = outbound.send(frames::data(channel, &second));
    Ok(Live { transport, session })
}

fn pair(
    bridge: &Bridge,
    channel: u32,
    tx: &UnboundedSender<Inbound>,
    message: &[u8],
    outbound: &UnboundedSender<Vec<u8>>,
) -> std::result::Result<Live, u16> {
    let Some((generation, psk)) = bridge.checkout_psk() else {
        return Err(CLOSE_PAIRING_REJECTED);
    };
    let mut guard = PskGuard {
        bridge,
        generation,
        committed: false,
    };
    let identity = bridge.identity().map_err(|_| CLOSE_PAIRING_REJECTED)?;
    let mut handshake = noise::read_initiator(
        identity.static_private(),
        MODE_PAIR,
        &identity.runner_id,
        Some(&psk),
        message,
    )
    .map_err(|_| CLOSE_PAIRING_REJECTED)?;
    let hello: PairHello =
        serde_json::from_slice(&handshake.payload).map_err(|_| CLOSE_PAIRING_REJECTED)?;
    if !label(&hello.name) || !label(&hello.platform) {
        return Err(CLOSE_PAIRING_REJECTED);
    }
    let remote = handshake.remote;
    let device_id = super::encode::public_id(&remote);
    let payload = serde_json::json!({ "ok": true, "deviceId": device_id }).to_string();
    let second = noise::write_second(&mut handshake, payload.as_bytes())
        .map_err(|_| CLOSE_PAIRING_REJECTED)?;
    let transport = noise::into_transport(handshake).map_err(|_| CLOSE_PAIRING_REJECTED)?;
    let session = bridge
        .enroll(generation, remote, hello.name, hello.platform, tx.clone())
        .map_err(|_| CLOSE_PAIRING_REJECTED)?;
    guard.committed = true;
    let _ = outbound.send(frames::data(channel, &second));
    Ok(Live { transport, session })
}

struct PskGuard<'a> {
    bridge: &'a Bridge,
    generation: u64,
    committed: bool,
}

impl Drop for PskGuard<'_> {
    fn drop(&mut self) {
        if !self.committed {
            self.bridge.release_psk(self.generation);
        }
    }
}

fn label(value: &str) -> bool {
    !value.is_empty() && value.len() <= NAME_LIMIT && !value.chars().any(char::is_control)
}

fn on_transport(
    bridge: &Bridge,
    live: &mut Live,
    channel: u32,
    bytes: &[u8],
    outbound: &UnboundedSender<Vec<u8>>,
) -> Result<()> {
    let plain = noise::read_transport(&mut live.transport, bytes)?;
    let (stream, kind, body) = frames::parse_stream(&plain)?;
    if stream == 0 && kind == CONTROL {
        if is_ping(body) {
            let pong = frames::stream(0, CONTROL, br#"{"type":"pong"}"#);
            let bytes = noise::write_transport(&mut live.transport, &pong)?;
            let _ = outbound.send(frames::data(channel, &bytes));
            bridge.touch(live.session.device_id());
        }
        return Ok(());
    }
    let reset = frames::stream(stream, RESET, br#"{"code":"forbidden"}"#);
    let bytes = noise::write_transport(&mut live.transport, &reset)?;
    let _ = outbound.send(frames::data(channel, &bytes));
    Ok(())
}

fn is_ping(body: &[u8]) -> bool {
    serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("type")
                .and_then(|kind| kind.as_str())
                .map(|kind| kind == "ping")
        })
        .unwrap_or(false)
}
