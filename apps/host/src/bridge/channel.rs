//! One Relay channel: the Noise handshake, then the stream multiplexer that carries a Device's
//! HTTP requests and WebSocket connections to the loopback dsh web.
//!
//! Stream 0 is CONTROL. Every other stream is opened by the Device with an odd, increasing
//! number and owned by one child task; a frame for a stream that is not open is refused.

use super::{
    Bridge, Session,
    frames::{
        self, BODY, CLOSE_HANDSHAKE_FAILED, CLOSE_NORMAL, CLOSE_PAIRING_REJECTED, CONTROL, END,
        HTTP_REQUEST, MODE_DAILY, MODE_PAIR, RESET, WS_BINARY, WS_CLOSE, WS_OPEN, WS_TEXT,
    },
    http, noise,
    outbox::{OutFrame, Outbox},
    ws,
};
use crate::Result;
use serde::Deserialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};

pub(super) enum Inbound {
    Data(Vec<u8>),
    Closed,
    Revoke,
}

/// A frame the Device sent on a stream, or the end of that stream.
pub(super) enum Up {
    Frame { kind: u8, body: Vec<u8> },
    Closed,
}

/// A frame a stream's task sends back to the Device.
pub(super) enum Down {
    Frame {
        stream: u32,
        kind: u8,
        body: Vec<u8>,
    },
    Done {
        stream: u32,
    },
}

/// The handle a stream's task uses to answer it.
#[derive(Clone)]
pub(super) struct Sink {
    tx: UnboundedSender<Down>,
    stream: u32,
    channel: u32,
}

impl Sink {
    pub(super) fn channel(&self) -> u32 {
        self.channel
    }

    pub(super) fn frame(&self, kind: u8, body: Vec<u8>) {
        let _ = self.tx.send(Down::Frame {
            stream: self.stream,
            kind,
            body,
        });
    }

    pub(super) fn stream(&self) -> u32 {
        self.stream
    }

    pub(super) fn reset(&self, code: &str) {
        self.frame(RESET, frames::code(code));
    }

    pub(super) fn done(&self) {
        let _ = self.tx.send(Down::Done {
            stream: self.stream,
        });
    }
}

const NAME_LIMIT: usize = 256;

#[derive(Deserialize)]
struct PairHello {
    name: String,
    platform: String,
}

enum Target {
    Http(UnboundedSender<Up>),
    Ws(UnboundedSender<Up>),
}

impl Target {
    fn sender(&self) -> &UnboundedSender<Up> {
        match self {
            Self::Http(tx) | Self::Ws(tx) => tx,
        }
    }

    fn allows(&self, kind: u8) -> bool {
        match self {
            Self::Http(_) => matches!(kind, BODY | END | RESET),
            Self::Ws(_) => matches!(kind, WS_TEXT | WS_BINARY | WS_CLOSE | RESET),
        }
    }
}

struct Live {
    transport: snow::TransportState,
    session: Session,
    channel: u32,
    outbound: UnboundedSender<OutFrame>,
    down: UnboundedSender<Down>,
    outbox: Arc<Outbox>,
    streams: HashMap<u32, Target>,
    last_stream: u32,
}

impl Live {
    fn seal(&mut self, stream: u32, kind: u8, body: &[u8]) -> Result<Vec<u8>> {
        let plain = frames::stream(stream, kind, body);
        let sealed = noise::write_transport(&mut self.transport, &plain)?;
        Ok(frames::data(self.channel, &sealed))
    }

    /// Delivers a frame a stream's task produced. A stream whose backlog would exceed the
    /// contract's limit is reset instead, so one slow stream cannot starve the channel.
    fn deliver(&mut self, stream: u32, kind: u8, body: Vec<u8>) {
        if !self.streams.contains_key(&stream) {
            return;
        }
        let size = body.len() + 5;
        if !self.outbox.reserve(stream, size) {
            self.fail(stream, "overloaded");
            return;
        }
        match self.seal(stream, kind, &body) {
            Ok(bytes) => {
                let _ = self.outbound.send(OutFrame {
                    bytes,
                    stream,
                    size,
                    outbox: self.outbox.clone(),
                });
            }
            Err(_) => self.fail(stream, "protocol"),
        }
    }

    /// Ends one stream: the Device is told why, its task is stopped, and nothing it still
    /// produces is forwarded.
    fn fail(&mut self, stream: u32, code: &str) {
        if let Some(target) = self.streams.remove(&stream) {
            let _ = target.sender().send(Up::Closed);
        }
        if let Ok(bytes) = self.seal(stream, RESET, &frames::code(code)) {
            let _ = self.outbound.send(OutFrame {
                bytes,
                stream: 0,
                size: 0,
                outbox: self.outbox.clone(),
            });
        }
    }

    fn close_all(&mut self) {
        for (_, target) in self.streams.drain() {
            let _ = target.sender().send(Up::Closed);
        }
    }

    /// Routes one plaintext stream frame, opening a stream when the Device does.
    fn on_frame(&mut self, bridge: &Bridge, plain: &[u8]) {
        let Ok((stream, kind, body)) = frames::parse_stream(plain) else {
            self.refuse(stream_of(plain), "protocol");
            return;
        };
        if stream == 0 {
            match kind {
                CONTROL => self.control(bridge, body),
                RESET => self.refuse(0, "protocol"),
                _ => self.refuse(0, "protocol"),
            }
            return;
        }
        if let Some(target) = self.streams.get(&stream) {
            if !target.allows(kind) {
                self.fail(stream, "protocol");
                return;
            }
            let _ = target.sender().send(Up::Frame {
                kind,
                body: body.to_vec(),
            });
            if kind == RESET {
                self.streams.remove(&stream);
            }
            return;
        }
        if kind == HTTP_REQUEST || kind == WS_OPEN {
            if stream % 2 == 0 || stream <= self.last_stream {
                self.refuse(stream, "protocol");
                return;
            }
            let (tx, rx) = unbounded_channel();
            let sink = Sink {
                tx: self.down.clone(),
                stream,
                channel: self.channel,
            };
            let target = match kind {
                WS_OPEN => {
                    let body = body.to_vec();
                    tokio::spawn(ws::run(bridge.clone(), stream, body, rx, sink));
                    Target::Ws(tx)
                }
                _ => {
                    let body = body.to_vec();
                    tokio::spawn(http::run(bridge.clone(), body, rx, sink));
                    Target::Http(tx)
                }
            };
            self.streams.insert(stream, target);
            self.last_stream = stream;
            return;
        }
        if stream > self.last_stream {
            self.refuse(stream, "protocol");
        }
        // A late frame for a stream that already ended is dropped in silence.
    }

    fn control(&mut self, bridge: &Bridge, body: &[u8]) {
        if !is_ping(body) {
            return;
        }
        if let Ok(bytes) = self.seal(0, CONTROL, br#"{"type":"pong"}"#) {
            let _ = self.outbound.send(OutFrame {
                bytes,
                stream: 0,
                size: 0,
                outbox: self.outbox.clone(),
            });
        }
        bridge.touch(self.session.device_id());
    }

    fn refuse(&mut self, stream: u32, code: &str) {
        if let Ok(bytes) = self.seal(stream, RESET, &frames::code(code)) {
            let _ = self.outbound.send(OutFrame {
                bytes,
                stream: 0,
                size: 0,
                outbox: self.outbox.clone(),
            });
        }
    }
}

fn raw(bytes: Vec<u8>) -> OutFrame {
    OutFrame {
        bytes,
        stream: 0,
        size: 0,
        outbox: Outbox::new(),
    }
}

fn stream_of(plain: &[u8]) -> u32 {
    plain
        .get(..4)
        .and_then(|head| head.try_into().ok())
        .map(u32::from_be_bytes)
        .unwrap_or(0)
}

pub(super) async fn run(
    bridge: Bridge,
    channel: u32,
    tx: UnboundedSender<Inbound>,
    mut rx: UnboundedReceiver<Inbound>,
    outbound: UnboundedSender<OutFrame>,
) {
    let (down_tx, mut down_rx) = unbounded_channel::<Down>();
    let mut live: Option<Live> = None;
    loop {
        tokio::select! {
            message = rx.recv() => {
                let Some(message) = message else { break };
                match message {
                    Inbound::Closed => break,
                    Inbound::Revoke => {
                        if let Some(current) = live.as_mut() {
                            current.control_revoked();
                        }
                        let _ = outbound.send(raw(frames::close(channel, CLOSE_NORMAL)));                        break;
                    }
                    Inbound::Data(bytes) => {
                        if live.is_none() {
                            match handshake(&bridge, channel, &tx, &bytes, &outbound, &down_tx) {
                                Ok(next) => live = Some(next),
                                Err(code) => {
                                    let _ = outbound.send(raw(frames::close(channel, code)));                                    break;
                                }
                            }
                        } else if let Some(current) = live.as_mut() {
                            let outcome = noise::read_transport(&mut current.transport, &bytes);
                            match outcome {
                                Ok(plain) => current.on_frame(&bridge, &plain),
                                Err(_) => {
                                    let _ = outbound.send(raw(frames::close(channel, CLOSE_NORMAL)));                                    break;
                                }
                            }
                        }
                    }
                }
            }
            down = down_rx.recv(), if live.is_some() => {
                let Some(down) = down else { continue };
                let Some(current) = live.as_mut() else { continue };
                match down {
                    Down::Frame { stream, kind, body } => current.deliver(stream, kind, body),
                    Down::Done { stream } => {
                        current.streams.remove(&stream);
                    }
                }
            }
        }
    }
    if let Some(current) = live.as_mut() {
        current.close_all();
    }
}

fn handshake(
    bridge: &Bridge,
    channel: u32,
    tx: &UnboundedSender<Inbound>,
    bytes: &[u8],
    outbound: &UnboundedSender<OutFrame>,
    down: &UnboundedSender<Down>,
) -> std::result::Result<Live, u16> {
    let Some((mode, message)) = bytes.split_first() else {
        return Err(CLOSE_HANDSHAKE_FAILED);
    };
    match *mode {
        MODE_DAILY => daily(bridge, channel, tx, message, outbound, down),
        MODE_PAIR => pair(bridge, channel, tx, message, outbound, down),
        _ => Err(CLOSE_HANDSHAKE_FAILED),
    }
}

fn daily(
    bridge: &Bridge,
    channel: u32,
    tx: &UnboundedSender<Inbound>,
    message: &[u8],
    outbound: &UnboundedSender<OutFrame>,
    down: &UnboundedSender<Down>,
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
        let _ = outbound.send(raw(frames::data(channel, &second)));
        return Err(CLOSE_NORMAL);
    };
    let transport = noise::into_transport(handshake).map_err(|_| CLOSE_HANDSHAKE_FAILED)?;
    let _ = outbound.send(raw(frames::data(channel, &second)));
    Ok(Live::new(transport, session, channel, outbound, down))
}

fn pair(
    bridge: &Bridge,
    channel: u32,
    tx: &UnboundedSender<Inbound>,
    message: &[u8],
    outbound: &UnboundedSender<OutFrame>,
    down: &UnboundedSender<Down>,
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
    let _ = outbound.send(raw(frames::data(channel, &second)));
    Ok(Live::new(transport, session, channel, outbound, down))
}

impl Live {
    fn new(
        transport: snow::TransportState,
        session: Session,
        channel: u32,
        outbound: &UnboundedSender<OutFrame>,
        down: &UnboundedSender<Down>,
    ) -> Self {
        Self {
            transport,
            session,
            channel,
            outbound: outbound.clone(),
            down: down.clone(),
            outbox: Outbox::new(),
            streams: HashMap::new(),
            last_stream: 0,
        }
    }

    fn control_revoked(&mut self) {
        if let Ok(bytes) = self.seal(0, CONTROL, br#"{"type":"revoked"}"#) {
            let _ = self.outbound.send(OutFrame {
                bytes,
                stream: 0,
                size: 0,
                outbox: self.outbox.clone(),
            });
        }
    }
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

#[allow(dead_code)]
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[allow(dead_code)]
fn unused(_: &Mutex<u8>) {}
