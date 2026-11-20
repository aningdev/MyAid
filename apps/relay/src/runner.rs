//! `/v1/runner`: registration and one frame pump per Runner link.
//!
//! `Registry` owns the runner table; each link task owns its channel table.

use crate::{
    auth,
    frame::{self, BridgeFrame},
    limits::Limits,
    tap::Tap,
};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::{
    sync::{
        mpsc::{self, UnboundedReceiver, UnboundedSender},
        oneshot,
    },
    time::{Instant, interval_at, timeout},
};

/// Time a closing link gets to flush its last frame.
const FLUSH: Duration = Duration::from_secs(2);

/// The runner table. One entry per runner id, replaced by a newer registration.
pub struct Registry {
    runners: Mutex<HashMap<String, Slot>>,
    generation: AtomicU64,
}

struct Slot {
    generation: u64,
    commands: UnboundedSender<Command>,
}

/// What a Device channel asks of its Runner link.
pub enum Command {
    /// Allocate a channel and tell the Bridge about it.
    Open {
        inbound: UnboundedSender<Event>,
        backlog: Arc<AtomicUsize>,
        reply: oneshot::Sender<Result<u32, u16>>,
    },
    /// Forward one Device payload; `queued` is released once it is on the wire.
    Data {
        channel: u32,
        payload: Vec<u8>,
        queued: Arc<AtomicUsize>,
    },
    /// The Device side ended; tell the Bridge unless the Bridge closed it first.
    Closed { channel: u32, code: u16 },
    /// Close this link; used when a newer registration replaces it.
    Shutdown { code: u16 },
}

/// What a Runner link delivers to one Device channel.
pub enum Event {
    Data(Vec<u8>),
    Close(u16),
}

struct Channel {
    inbound: UnboundedSender<Event>,
    backlog: Arc<AtomicUsize>,
}

enum Outgoing {
    Frame {
        bytes: Vec<u8>,
        release: Option<(Arc<AtomicUsize>, usize)>,
    },
    Close(u16),
}

impl Registry {
    pub fn new() -> Self {
        Self {
            runners: Mutex::new(HashMap::new()),
            generation: AtomicU64::new(0),
        }
    }

    /// Take the runner id for this connection, returning its generation and the
    /// command channel of the link it replaced.
    fn register(
        &self,
        id: &str,
        commands: UnboundedSender<Command>,
    ) -> (u64, Option<UnboundedSender<Command>>) {
        let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
        let previous = self.runners().insert(
            id.to_string(),
            Slot {
                generation,
                commands,
            },
        );
        (generation, previous.map(|slot| slot.commands))
    }

    /// Drop the registration only if it still belongs to this link.
    fn remove(&self, id: &str, generation: u64) {
        let mut runners = self.runners();
        if runners
            .get(id)
            .is_some_and(|slot| slot.generation == generation)
        {
            runners.remove(id);
        }
    }

    pub fn commands(&self, id: &str) -> Option<UnboundedSender<Command>> {
        self.runners().get(id).map(|slot| slot.commands.clone())
    }

    fn runners(&self) -> std::sync::MutexGuard<'_, HashMap<String, Slot>> {
        self.runners
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }
}

/// Run one Runner WebSocket from challenge to close.
pub async fn serve_connection(
    socket: WebSocket,
    registry: Arc<Registry>,
    limits: Limits,
    tap: Tap,
) {
    let mut socket = socket;
    let nonce = match auth::random_nonce() {
        Ok(nonce) => nonce,
        Err(error) => {
            tracing::error!(%error, "relay challenge");
            frame::close_socket(socket, frame::BAD_AUTH).await;
            return;
        }
    };
    let challenge = serde_json::json!({ "type": "challenge", "nonce": auth::b64(&nonce) });
    if socket
        .send(Message::Text(challenge.to_string().into()))
        .await
        .is_err()
    {
        return;
    }
    let hello = match timeout(limits.register, read_hello(&mut socket)).await {
        Ok(Some(hello)) => hello,
        Ok(None) => return,
        Err(_) => {
            tracing::warn!("relay runner registration timed out");
            frame::close_socket(socket, frame::BAD_AUTH).await;
            return;
        }
    };
    let (id, _) = match auth::verify(&hello, &nonce) {
        Ok(verified) => verified,
        Err(error) => {
            tracing::warn!(%error, "relay runner registration refused");
            frame::close_socket(socket, frame::BAD_AUTH).await;
            return;
        }
    };

    let (commands_tx, commands_rx) = mpsc::unbounded_channel();
    let (generation, previous) = registry.register(&id, commands_tx);
    if let Some(previous) = previous {
        let _ = previous.send(Command::Shutdown {
            code: frame::REPLACED,
        });
    }
    let ready = serde_json::json!({ "type": "ready", "runner": id });
    if socket
        .send(Message::Text(ready.to_string().into()))
        .await
        .is_err()
    {
        registry.remove(&id, generation);
        return;
    }
    tracing::info!(runner = %id, "relay runner registered");
    link(
        socket,
        &registry,
        &id,
        generation,
        commands_rx,
        &limits,
        tap,
    )
    .await;
}

async fn read_hello(socket: &mut WebSocket) -> Option<auth::Hello> {
    loop {
        match socket.recv().await {
            Some(Ok(Message::Text(text))) => return serde_json::from_str(&text).ok(),
            Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
            Some(Ok(_)) | Some(Err(_)) | None => return None,
        }
    }
}

async fn link(
    socket: WebSocket,
    registry: &Registry,
    id: &str,
    generation: u64,
    mut commands: UnboundedReceiver<Command>,
    limits: &Limits,
    tap: Tap,
) {
    let (sink, mut incoming) = socket.split();
    let (out, out_rx) = mpsc::unbounded_channel();
    let writer = tokio::spawn(write_loop(sink, out_rx, limits.ping, tap.clone()));
    let mut channels: HashMap<u32, Channel> = HashMap::new();
    let mut next = 1u32;
    let mut shutdown = None;

    loop {
        tokio::select! {
            command = commands.recv() => match command {
                Some(Command::Open { inbound, backlog, reply }) => {
                    if channels.len() >= limits.max_channels {
                        let _ = reply.send(Err(frame::TOO_MANY));
                        continue;
                    }
                    let channel = allocate(&mut next, &channels);
                    channels.insert(channel, Channel { inbound, backlog });
                    let _ = out.send(Outgoing::Frame { bytes: frame::open(channel), release: None });
                    let _ = reply.send(Ok(channel));
                }
                Some(Command::Data { channel, payload, queued }) => {
                    if channels.contains_key(&channel) {
                        let length = payload.len();
                        let bytes = frame::data(channel, &payload);
                        let _ = out.send(Outgoing::Frame {
                            bytes,
                            release: Some((queued, length)),
                        });
                    }
                }
                Some(Command::Closed { channel, code }) => {
                    if channels.remove(&channel).is_some() {
                        let bytes = frame::close(channel, code);
                        let _ = out.send(Outgoing::Frame { bytes, release: None });
                    }
                }
                Some(Command::Shutdown { code }) => {
                    shutdown = Some(code);
                    break;
                }
                None => break,
            },
            message = incoming.next() => match message {
                Some(Ok(Message::Binary(bytes))) => {
                    tap.record("bridge", "in", &bytes);
                    deliver(&bytes, &mut channels, limits, &out);
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(error)) => {
                    tracing::debug!(%error, runner = %id, "relay runner socket");
                    break;
                }
            },
        }
    }

    for channel in channels.into_values() {
        let _ = channel.inbound.send(Event::Close(frame::RUNNER_OFFLINE));
    }
    registry.remove(id, generation);
    let _ = out.send(Outgoing::Close(shutdown.unwrap_or(frame::NORMAL)));
    drop(out);
    let _ = timeout(FLUSH, writer).await;
    tracing::info!(runner = %id, "relay runner link ended");
}

/// One Bridge frame for a channel: forward it, or close the channel if it cannot.
fn deliver(
    bytes: &[u8],
    channels: &mut HashMap<u32, Channel>,
    limits: &Limits,
    out: &UnboundedSender<Outgoing>,
) {
    match BridgeFrame::decode(bytes) {
        Some(BridgeFrame::Data { channel, payload }) => {
            let Some(entry) = channels.get(&channel) else {
                return;
            };
            let length = payload.len();
            if length > limits.max_message
                || entry.backlog.load(Ordering::Acquire) + length > limits.max_backlog
            {
                tracing::warn!(channel, length, "relay channel overloaded");
                if let Some(entry) = channels.remove(&channel) {
                    let _ = entry.inbound.send(Event::Close(frame::OVERLOADED));
                }
                let bytes = frame::close(channel, frame::OVERLOADED);
                let _ = out.send(Outgoing::Frame {
                    bytes,
                    release: None,
                });
                return;
            }
            entry.backlog.fetch_add(length, Ordering::AcqRel);
            if entry.inbound.send(Event::Data(payload)).is_err() {
                channels.remove(&channel);
                let bytes = frame::close(channel, frame::NORMAL);
                let _ = out.send(Outgoing::Frame {
                    bytes,
                    release: None,
                });
            }
        }
        Some(BridgeFrame::Close { channel, code }) => {
            if let Some(entry) = channels.remove(&channel) {
                let _ = entry.inbound.send(Event::Close(code));
            }
        }
        Some(BridgeFrame::Open) => tracing::debug!("relay runner sent OPEN"),
        None => tracing::debug!("relay runner sent an unknown frame"),
    }
}

fn allocate(next: &mut u32, channels: &HashMap<u32, Channel>) -> u32 {
    loop {
        let channel = *next;
        *next = next.wrapping_add(1);
        if *next == 0 {
            *next = 1;
        }
        if !channels.contains_key(&channel) {
            return channel;
        }
    }
}

async fn write_loop(
    mut sink: futures_util::stream::SplitSink<WebSocket, Message>,
    mut out: UnboundedReceiver<Outgoing>,
    ping: Duration,
    tap: Tap,
) {
    let mut heartbeat = interval_at(Instant::now() + ping, ping);
    loop {
        tokio::select! {
            frame = out.recv() => match frame {
                Some(Outgoing::Frame { bytes, release }) => {
                    tap.record("bridge", "out", &bytes);
                    if sink.send(Message::Binary(bytes.into())).await.is_err() {
                        break;
                    }
                    if let Some((queued, length)) = release {
                        queued.fetch_sub(length, Ordering::AcqRel);
                    }
                }
                Some(Outgoing::Close(code)) => {
                    let _ = sink.send(Message::Close(Some(frame::close_frame(code)))).await;
                    break;
                }
                None => break,
            },
            _ = heartbeat.tick() => {
                if sink.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
        }
    }
}
