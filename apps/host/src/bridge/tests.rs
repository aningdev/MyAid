//! Fake Relay and a snow Device. They exist only so Bridge can be tested; nothing here is the
//! product Relay.

use super::{
    Bridge, DEFAULT_RELAY_URL, DshEndpoint, DshSource, RelayPlan, channel,
    channel::Inbound,
    encode, frames,
    frames::{
        BODY, CONTROL, END, HTTP_REQUEST, HTTP_RESPONSE, MODE_DAILY, MODE_PAIR, RESET, WS_ACCEPT,
        WS_BINARY, WS_CLOSE, WS_OPEN, WS_TEXT,
    },
    identity, noise,
    outbox::OutFrame,
    plan_from,
};
use axum::{
    Router,
    body::Bytes,
    extract::{
        Query, State,
        ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use futures_util::{SinkExt, StreamExt};
use std::{
    collections::HashMap,
    net::Ipv4Addr,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{
    net::TcpListener,
    sync::mpsc::{UnboundedSender, unbounded_channel},
};
use tokio_tungstenite::{
    WebSocketStream, connect_async,
    tungstenite::{Message, protocol::frame::coding::CloseCode},
};

const PREFIX: &[u8] = b"dsh-bot-relay/1 runner\n";

type Socket = WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

fn random_key() -> [u8; 32] {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("random");
    bytes
}

fn initiator(
    mode: u8,
    runner_id: &str,
    runner_public: &[u8; 32],
    device_private: &[u8; 32],
    psk: Option<&[u8; 32]>,
) -> snow::HandshakeState {
    let name = if psk.is_some() {
        noise::IK_PSK1
    } else {
        noise::IK
    };
    let prologue = noise::prologue(mode, runner_id);
    let mut builder = snow::Builder::new(noise::pattern(name).expect("pattern"))
        .local_private_key(device_private)
        .expect("local")
        .remote_public_key(runner_public)
        .expect("remote")
        .prologue(&prologue)
        .expect("prologue");
    if let Some(psk) = psk {
        builder = builder.psk(1, psk).expect("psk");
    }
    builder.build_initiator().expect("initiator")
}

fn write_handshake(state: &mut snow::HandshakeState, payload: &[u8]) -> Vec<u8> {
    let mut buf = vec![0u8; payload.len() + 512];
    let len = state
        .write_message(payload, &mut buf)
        .expect("write handshake");
    buf.truncate(len);
    buf
}

fn read_handshake(state: &mut snow::HandshakeState, message: &[u8]) -> Vec<u8> {
    let mut buf = vec![0u8; 65_535];
    let len = state
        .read_message(message, &mut buf)
        .expect("read handshake");
    buf.truncate(len);
    buf
}

fn write_transport(state: &mut snow::TransportState, payload: &[u8]) -> Vec<u8> {
    let mut buf = vec![0u8; payload.len() + 64];
    let len = state
        .write_message(payload, &mut buf)
        .expect("write transport");
    buf.truncate(len);
    buf
}

fn read_transport(state: &mut snow::TransportState, message: &[u8]) -> Vec<u8> {
    let mut buf = vec![0u8; 65_535];
    let len = state
        .read_message(message, &mut buf)
        .expect("read transport");
    buf.truncate(len);
    buf
}

enum PeerMsg {
    Binary(Vec<u8>),
    Closed(u16),
}

fn close_code(code: CloseCode) -> u16 {
    code.into()
}

async fn next_peer(socket: &mut Socket) -> PeerMsg {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("timed out waiting for the peer");
        match message {
            Some(Ok(Message::Binary(bytes))) => return PeerMsg::Binary(bytes.to_vec()),
            Some(Ok(Message::Close(frame))) => {
                return PeerMsg::Closed(frame.map(|frame| close_code(frame.code)).unwrap_or(1005));
            }
            Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
            Some(Ok(_)) => panic!("unexpected relay frame"),
            Some(Err(_)) | None => return PeerMsg::Closed(1006),
        }
    }
}

struct Ticket {
    runner_id: String,
    static_public: [u8; 32],
    psk: [u8; 32],
    expires_at: u64,
    origin: String,
}

fn parse_ticket(link: &str) -> Ticket {
    let (origin, fragment) = link.split_once('#').expect("pairing fragment");
    let mut fields = HashMap::new();
    for pair in fragment.split('&') {
        let (key, value) = pair.split_once('=').expect("pairing field");
        fields.insert(key, value);
    }
    assert_eq!(fields.get("v").copied(), Some("1"));
    Ticket {
        runner_id: fields["r"].to_string(),
        static_public: encode::b64_32(fields["k"]).expect("static key"),
        psk: encode::b64_32(fields["p"]).expect("psk"),
        expires_at: fields["e"].parse().expect("expiry"),
        origin: origin.to_string(),
    }
}

struct Started {
    dir: tempfile::TempDir,
    now: Arc<AtomicU64>,
    bridge: Bridge,
    stop: Arc<AtomicBool>,
    port: u16,
    dsh: Fake,
}

async fn start() -> Started {
    let dsh = fake_dsh().await;
    let relay = Relay::bind().await;
    let dir = tempfile::tempdir().expect("tempdir");
    let now = Arc::new(AtomicU64::new(1_800_000_000));
    let url = format!("ws://127.0.0.1:{}", relay.port);
    let bridge = Bridge::open_for_test(dir.path(), Some(&url), now.clone(), dsh_source(&dsh));
    let stop = Arc::new(AtomicBool::new(false));
    bridge.spawn(stop.clone());
    wait_connected(&bridge).await;
    Started {
        dir,
        now,
        bridge,
        stop,
        port: relay.port,
        dsh,
    }
}

fn no_dsh() -> DshSource {
    Arc::new(|| None)
}

async fn wait_connected(bridge: &Bridge) {
    for _ in 0..100 {
        let body = bridge.devices().expect("devices");
        if body.relay.connected {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    let reason = bridge
        .devices()
        .expect("devices")
        .relay
        .reason
        .unwrap_or_default();
    panic!("relay did not become ready ({reason})");
}

fn issue(bridge: &Bridge, now: &AtomicU64, port: u16) -> Ticket {
    let before = now.load(Ordering::Relaxed);
    let ticket = bridge.issue_pairing().expect("pairing");
    let parsed = parse_ticket(&ticket.link);
    assert_eq!(parsed.expires_at, before + 300);
    assert_eq!(ticket.expires_at, parsed.expires_at);
    assert_eq!(parsed.origin, format!("http://127.0.0.1:{port}/pair"));
    assert_eq!(
        parsed.runner_id,
        bridge.identity().expect("identity").runner_id
    );
    assert_eq!(
        parsed.static_public,
        *bridge.identity().expect("identity").static_public()
    );
    parsed
}

async fn connect_device(port: u16, runner_id: &str) -> Socket {
    let url = format!("ws://127.0.0.1:{port}/v1/device?runner={runner_id}");
    let (socket, _) = tokio::time::timeout(Duration::from_secs(5), connect_async(url))
        .await
        .expect("device connect timed out")
        .expect("device connect");
    socket
}

async fn exchange(
    socket: &mut Socket,
    state: snow::HandshakeState,
    mode: u8,
    payload: &[u8],
) -> std::result::Result<(snow::HandshakeState, Vec<u8>), u16> {
    let mut state = state;
    let mut wire = vec![mode];
    wire.extend(write_handshake(&mut state, payload));
    socket
        .send(Message::binary(wire))
        .await
        .expect("send message 1");
    match next_peer(socket).await {
        PeerMsg::Binary(bytes) => {
            let payload = read_handshake(&mut state, &bytes);
            Ok((state, payload))
        }
        PeerMsg::Closed(code) => Err(code),
    }
}

fn verify_hello(nonce: &[u8], hello: &str) -> Result<String, ()> {
    let value: serde_json::Value = serde_json::from_str(hello).map_err(|_| ())?;
    if value["type"] != "hello" || value["protocol"] != 1 {
        return Err(());
    }
    let key = encode::b64_decode(value["key"].as_str().unwrap_or_default()).map_err(|_| ())?;
    let sig = encode::b64_decode(value["sig"].as_str().unwrap_or_default()).map_err(|_| ())?;
    if key.len() != 32 || sig.len() != 64 {
        return Err(());
    }
    let key: [u8; 32] = key.try_into().map_err(|_| ())?;
    let verifying = VerifyingKey::from_bytes(&key).map_err(|_| ())?;
    let signature = Signature::from_slice(&sig).map_err(|_| ())?;
    let mut message = PREFIX.to_vec();
    message.extend_from_slice(nonce);
    verifying.verify(&message, &signature).map_err(|_| ())?;
    Ok(encode::public_id(&key))
}

enum ToDevice {
    Data(Vec<u8>),
    Close(u16),
}

struct RelayState {
    runner_id: Mutex<Option<String>>,
    to_runner: Mutex<Option<UnboundedSender<Vec<u8>>>>,
    devices: Mutex<HashMap<u32, UnboundedSender<ToDevice>>>,
    next_channel: AtomicU32,
}

struct Relay {
    port: u16,
}

impl Relay {
    async fn bind() -> Self {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let state = Arc::new(RelayState {
            runner_id: Mutex::new(None),
            to_runner: Mutex::new(None),
            devices: Mutex::new(HashMap::new()),
            next_channel: AtomicU32::new(1),
        });
        tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                let state = state.clone();
                tokio::spawn(async move { serve_connection(stream, state).await });
            }
        });
        Self { port }
    }
}

async fn request_target(stream: &tokio::net::TcpStream) -> (String, String) {
    let mut buf = [0u8; 1024];
    for _ in 0..50 {
        let n = stream.peek(&mut buf).await.unwrap_or(0);
        if n > 0 && (buf[..n].windows(2).any(|pair| pair == b"\r\n") || n == buf.len()) {
            let text = String::from_utf8_lossy(&buf[..n]);
            let target = text
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("");
            let (path, query) = target.split_once('?').unwrap_or((target, ""));
            return (path.to_string(), query.to_string());
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    (String::new(), String::new())
}

async fn serve_connection(stream: tokio::net::TcpStream, state: Arc<RelayState>) {
    let (path, query) = request_target(&stream).await;
    let Ok(socket) = tokio_tungstenite::accept_async(stream).await else {
        return;
    };
    if path == "/v1/runner" {
        serve_runner(socket, state).await;
    } else if path == "/v1/device" {
        serve_device(socket, state, &query).await;
    }
}

async fn serve_runner(mut socket: WebSocketStream<tokio::net::TcpStream>, state: Arc<RelayState>) {
    let nonce = random_key();
    let challenge = serde_json::json!({
        "type": "challenge",
        "nonce": encode::b64(&nonce),
    });
    if socket
        .send(Message::text(challenge.to_string()))
        .await
        .is_err()
    {
        return;
    }
    let Some(Ok(Message::Text(hello))) = socket.next().await else {
        return;
    };
    let Ok(runner_id) = verify_hello(&nonce, &hello) else {
        let _ = socket
            .send(Message::Close(Some(
                tokio_tungstenite::tungstenite::protocol::CloseFrame {
                    code: 4004.into(),
                    reason: "bad-auth".into(),
                },
            )))
            .await;
        return;
    };
    let (tx, mut rx) = unbounded_channel();
    *state.to_runner.lock().expect("runner") = Some(tx);
    *state.runner_id.lock().expect("runner id") = Some(runner_id.clone());
    let ready = serde_json::json!({ "type": "ready", "runner": runner_id });
    if socket.send(Message::text(ready.to_string())).await.is_err() {
        return;
    }
    loop {
        tokio::select! {
            outgoing = rx.recv() => {
                let Some(frame) = outgoing else { break };
                if socket.send(Message::binary(frame)).await.is_err() {
                    break;
                }
            }
            incoming = socket.next() => match incoming {
                Some(Ok(Message::Binary(bytes))) => dispatch_runner(&state, &bytes),
                Some(Ok(Message::Ping(payload))) => {
                    if socket.send(Message::Pong(payload)).await.is_err() {
                        break;
                    }
                }
                Some(Ok(Message::Pong(_))) => {}
                _ => break,
            },
        }
    }
}

fn dispatch_runner(state: &RelayState, bytes: &[u8]) {
    let Some(frame) = frames::decode(bytes) else {
        return;
    };
    let mut devices = state.devices.lock().expect("devices");
    match frame {
        frames::RelayFrame::Data { channel, payload } => {
            if let Some(sender) = devices.get(&channel) {
                let _ = sender.send(ToDevice::Data(payload));
            }
        }
        frames::RelayFrame::Close { channel, code } => {
            if let Some(sender) = devices.remove(&channel) {
                let _ = sender.send(ToDevice::Close(code));
            }
        }
        frames::RelayFrame::Open { .. } => {}
    }
}

async fn serve_device(
    mut socket: WebSocketStream<tokio::net::TcpStream>,
    state: Arc<RelayState>,
    query: &str,
) {
    let wanted = query
        .split('&')
        .find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            (key == "runner").then(|| value.to_string())
        })
        .unwrap_or_default();
    let mut runner_id = None;
    for _ in 0..100 {
        runner_id = state.runner_id.lock().expect("runner id").clone();
        if runner_id.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    if runner_id.as_deref() != Some(wanted.as_str()) {
        return;
    }
    let Some(to_runner) = state.to_runner.lock().expect("runner").clone() else {
        return;
    };
    let channel = state.next_channel.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = unbounded_channel();
    state.devices.lock().expect("devices").insert(channel, tx);
    if to_runner.send(frames::open(channel)).is_err() {
        return;
    }
    loop {
        tokio::select! {
            incoming = socket.next() => match incoming {
                Some(Ok(Message::Binary(bytes))) => {
                    if to_runner.send(frames::data(channel, &bytes)).is_err() {
                        break;
                    }
                }
                Some(Ok(Message::Ping(payload))) => {
                    if socket.send(Message::Pong(payload)).await.is_err() {
                        break;
                    }
                }
                Some(Ok(Message::Pong(_))) => {}
                _ => {
                    let _ = to_runner.send(frames::close(channel, 1000));
                    break;
                }
            },
            outgoing = rx.recv() => match outgoing {
                Some(ToDevice::Data(payload)) => {
                    if socket.send(Message::binary(payload)).await.is_err() {
                        break;
                    }
                }
                Some(ToDevice::Close(code)) => {
                    let _ = socket
                        .send(Message::Close(Some(
                            tokio_tungstenite::tungstenite::protocol::CloseFrame {
                                code: code.into(),
                                reason: "closed".into(),
                            },
                        )))
                        .await;
                    break;
                }
                None => break,
            },
        }
    }
    state.devices.lock().expect("devices").remove(&channel);
}

#[test]
fn public_id_is_lowercase_unpadded_base32() {
    let id = encode::public_id(&[7u8; 32]);
    assert_eq!(id.len(), 32);
    assert!(id.chars().all(|char| matches!(char, 'a'..='z' | '2'..='7')));
    assert_eq!(identity::REGISTRATION_PREFIX, PREFIX);
}

#[test]
fn relay_frames_are_big_endian() {
    assert_eq!(frames::open(7), vec![0, 0, 0, 7, 1]);
    assert_eq!(frames::data(1, b"ab"), vec![0, 0, 0, 1, 2, b'a', b'b']);
    assert_eq!(frames::close(1, 4010), vec![0, 0, 0, 1, 3, 0x0f, 0xaa]);
    assert_eq!(frames::close(1, 4011), vec![0, 0, 0, 1, 3, 0x0f, 0xab]);
    assert_eq!(frames::close(1, 1000), vec![0, 0, 0, 1, 3, 0x03, 0xe8]);
    assert_eq!(
        frames::stream(9, CONTROL, b"z"),
        vec![0, 0, 0, 9, CONTROL, b'z']
    );
}

#[test]
fn ik_responder_learns_the_device_static_key() {
    let runner_private = random_key();
    let runner_public = identity::x25519_public(&runner_private);
    let device_private = random_key();
    let device_public = identity::x25519_public(&device_private);
    let mut initiator = initiator(MODE_DAILY, "runner", &runner_public, &device_private, None);
    let message = write_handshake(&mut initiator, b"{}");
    let handshake = noise::read_initiator(&runner_private, MODE_DAILY, "runner", None, &message)
        .expect("message 1");
    assert_eq!(handshake.remote, device_public);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn wrong_psk_is_rejected_at_message_one() {
    let started = start().await;
    let ticket = issue(&started.bridge, &started.now, started.port);
    let mut wrong = ticket.psk;
    wrong[0] ^= 0xff;
    let mut socket = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &random_key(),
        Some(&wrong),
    );
    let error = exchange(
        &mut socket,
        state,
        MODE_PAIR,
        br#"{"name":"Wrong","platform":"test"}"#,
    )
    .await
    .expect_err("wrong psk");
    assert_eq!(error, 4010);
    assert!(!started.dir.path().join("host/bridge/devices.json").exists());

    let mut again = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &random_key(),
        Some(&ticket.psk),
    );
    exchange(
        &mut again,
        state,
        MODE_PAIR,
        br#"{"name":"Desk","platform":"test"}"#,
    )
    .await
    .expect("the unused psk still pairs");
    let stored = std::fs::read_to_string(started.dir.path().join("host/bridge/devices.json"))
        .expect("devices.json");
    let stored: serde_json::Value = serde_json::from_str(&stored).expect("json");
    assert_eq!(stored["devices"].as_array().expect("devices").len(), 1);
    assert_eq!(stored["devices"][0]["name"], "Desk");
    started.stop.store(true, Ordering::Relaxed);
}

#[test]
fn rustls_client_config_builds() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let _ = rustls::ClientConfig::builder()
        .with_root_certificates(rustls::RootCertStore::empty())
        .with_no_client_auth();
}

#[test]
fn an_unset_relay_is_the_project_relay() {
    for setting in [None, Some(""), Some("  ")] {
        let RelayPlan::Up { ws, origin } = plan_from(setting) else {
            panic!("{setting:?} left the Relay down");
        };
        assert_eq!(ws.as_str(), "wss://relay.aning.dev/v1/runner");
        assert_eq!(origin, DEFAULT_RELAY_URL);
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_unusable_relay_address_is_not_dialed() {
    let dir = tempfile::tempdir().expect("tempdir");
    let now = Arc::new(AtomicU64::new(1_800_000_000));
    for setting in ["not a url", "relay.example"] {
        let bridge = Bridge::open_for_test(dir.path(), Some(setting), now.clone(), no_dsh());
        bridge.spawn(Arc::new(AtomicBool::new(false)));
        tokio::time::sleep(Duration::from_millis(30)).await;
        let body = bridge.devices().expect("devices");
        assert!(!body.relay.configured);
        assert!(!body.relay.connected);
        let reason = body.relay.reason.expect("reason");
        assert!(reason.contains("not a usable"), "{reason}");
    }
    assert!(!dir.path().join("host/bridge/identity.json").exists());
    let broken = Bridge::open_for_test(dir.path(), Some("ftp://relay.example"), now, no_dsh());
    assert!(!broken.devices().expect("devices").relay.configured);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn relay_address_without_tls_must_be_loopback() {
    let dir = tempfile::tempdir().expect("tempdir");
    let now = Arc::new(AtomicU64::new(1_800_000_000));
    for setting in [
        "https://relay.example",
        "wss://relay.example",
        "http://127.0.0.1:8080",
        "ws://localhost:8080",
        "http://[::1]:8080",
    ] {
        let bridge = Bridge::open_for_test(dir.path(), Some(setting), now.clone(), no_dsh());
        let relay = bridge.devices().expect("devices").relay;
        assert!(relay.configured, "{setting}");
    }
    for setting in [
        "http://relay.example",
        "ws://relay.example",
        "http://192.168.1.10:8080",
    ] {
        let bridge = Bridge::open_for_test(dir.path(), Some(setting), now.clone(), no_dsh());
        let relay = bridge.devices().expect("devices").relay;
        assert!(!relay.configured, "{setting}");
        let reason = relay.reason.expect("reason");
        assert!(reason.contains("loopback"), "{reason}");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn fake_relay_verifies_the_registration_signature() {
    let signing = SigningKey::from_bytes(&random_key());
    let nonce = random_key();
    let mut message = PREFIX.to_vec();
    message.extend_from_slice(&nonce);
    let signature = signing.sign(&message);
    let hello = serde_json::json!({
        "type": "hello",
        "protocol": 1,
        "key": encode::b64(signing.verifying_key().as_bytes()),
        "sig": encode::b64(&signature.to_bytes()),
    });
    let runner_id = verify_hello(&nonce, &hello.to_string()).expect("good signature");
    assert_eq!(
        runner_id,
        encode::public_id(signing.verifying_key().as_bytes())
    );
    let mut bad = hello;
    bad["sig"] = serde_json::Value::String(encode::b64(&[0u8; 64]));
    assert!(verify_hello(&nonce, &bad.to_string()).is_err());

    let relay = Relay::bind().await;
    let (mut socket, _) = connect_async(format!("ws://127.0.0.1:{}/v1/runner", relay.port))
        .await
        .expect("connect");
    let Some(Ok(Message::Text(_))) = socket.next().await else {
        panic!("missing challenge");
    };
    socket
        .send(Message::text(bad.to_string()))
        .await
        .expect("hello");
    match next_peer(&mut socket).await {
        PeerMsg::Closed(code) => assert_eq!(code, 4004),
        PeerMsg::Binary(_) => panic!("a bad signature still received a frame"),
    }

    let started = start().await;
    let identity = started.bridge.identity().expect("identity");
    assert_eq!(
        identity.runner_id,
        encode::public_id(&identity.registration_public())
    );
    let path = started.dir.path().join("host/bridge/identity.json");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&path)
            .expect("identity")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }
    let again = Bridge::open_for_test(started.dir.path(), None, started.now.clone(), no_dsh());
    assert_eq!(
        again.identity().expect("reloaded").runner_id,
        identity.runner_id
    );
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn pairing_writes_devices_json() {
    let started = start().await;
    let ticket = issue(&started.bridge, &started.now, started.port);
    started.now.store(ticket.expires_at - 1, Ordering::Relaxed);
    let device_private = random_key();
    let mut socket = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &device_private,
        Some(&ticket.psk),
    );
    let (handshake, payload) = exchange(
        &mut socket,
        state,
        MODE_PAIR,
        br#"{"name":"Desk","platform":"test"}"#,
    )
    .await
    .expect("pairing message 2");
    let accepted: serde_json::Value = serde_json::from_slice(&payload).expect("json");
    assert_eq!(accepted["ok"], true);
    let device_id = accepted["deviceId"]
        .as_str()
        .expect("device id")
        .to_string();
    assert_eq!(
        device_id,
        encode::public_id(&identity::x25519_public(&device_private))
    );
    let _transport = handshake.into_transport_mode().expect("transport");

    let body = started.bridge.devices().expect("devices");
    assert!(body.devices[0].online);
    assert_eq!(body.devices[0].name, "Desk");
    assert_eq!(body.devices[0].last_seen_at, ticket.expires_at - 1);
    let event: serde_json::Value =
        serde_json::from_str(&started.bridge.devices_event().expect("event")).expect("event json");
    assert_eq!(event["event"], "bridge.devices");
    assert!(event.get("relay").is_none());
    assert_eq!(event["devices"][0]["deviceId"], device_id);

    let file = std::fs::read_to_string(started.dir.path().join("host/bridge/devices.json"))
        .expect("devices.json");
    let stored: serde_json::Value = serde_json::from_str(&file).expect("devices json");
    assert_eq!(stored["devices"][0]["deviceId"], device_id);
    assert_eq!(stored["devices"][0]["name"], "Desk");
    assert_eq!(stored["devices"][0]["platform"], "test");
    let public_key = encode::b64_32(stored["devices"][0]["publicKey"].as_str().expect("key"))
        .expect("key bytes");
    assert_eq!(encode::public_id(&public_key), device_id);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(started.dir.path().join("host/bridge/devices.json"))
            .expect("meta")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn spent_psk_is_rejected() {
    let started = start().await;
    let ticket = issue(&started.bridge, &started.now, started.port);
    let mut socket = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &random_key(),
        Some(&ticket.psk),
    );
    exchange(
        &mut socket,
        state,
        MODE_PAIR,
        br#"{"name":"Desk","platform":"test"}"#,
    )
    .await
    .expect("first pairing");

    let mut again = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &random_key(),
        Some(&ticket.psk),
    );
    let error = exchange(
        &mut again,
        state,
        MODE_PAIR,
        br#"{"name":"Other","platform":"test"}"#,
    )
    .await
    .expect_err("spent psk");
    assert_eq!(error, 4010);
    let stored = std::fs::read_to_string(started.dir.path().join("host/bridge/devices.json"))
        .expect("devices.json");
    let stored: serde_json::Value = serde_json::from_str(&stored).expect("json");
    assert_eq!(stored["devices"].as_array().expect("devices").len(), 1);
    assert_eq!(stored["devices"][0]["name"], "Desk");
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn expired_psk_is_rejected() {
    let started = start().await;
    let ticket = issue(&started.bridge, &started.now, started.port);
    started.now.store(ticket.expires_at, Ordering::Relaxed);
    let mut socket = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &random_key(),
        Some(&ticket.psk),
    );
    let error = exchange(
        &mut socket,
        state,
        MODE_PAIR,
        br#"{"name":"Desk","platform":"test"}"#,
    )
    .await
    .expect_err("expired psk");
    assert_eq!(error, 4010);
    assert!(!started.dir.path().join("host/bridge/devices.json").exists());
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn daily_connection_answers_ping_with_pong() {
    let started = start().await;
    let ticket = issue(&started.bridge, &started.now, started.port);
    let device_private = random_key();
    let mut pairing = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &device_private,
        Some(&ticket.psk),
    );
    exchange(
        &mut pairing,
        state,
        MODE_PAIR,
        br#"{"name":"Desk","platform":"test"}"#,
    )
    .await
    .expect("pair");
    drop(pairing);

    let mut socket = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_DAILY,
        &ticket.runner_id,
        &ticket.static_public,
        &device_private,
        None,
    );
    let (handshake, payload) = exchange(&mut socket, state, MODE_DAILY, b"{}")
        .await
        .expect("daily message 2");
    assert_eq!(payload, br#"{"ok":true}"#);
    let mut transport = handshake.into_transport_mode().expect("transport");
    let ping = frames::stream(0, CONTROL, br#"{"type":"ping"}"#);
    socket
        .send(Message::binary(write_transport(&mut transport, &ping)))
        .await
        .expect("ping");
    let PeerMsg::Binary(pong) = next_peer(&mut socket).await else {
        panic!("missing pong");
    };
    assert_eq!(
        read_transport(&mut transport, &pong),
        frames::stream(0, CONTROL, br#"{"type":"pong"}"#)
    );

    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn unpaired_device_gets_device_revoked() {
    let started = start().await;
    let identity = started.bridge.identity().expect("identity");
    let mut socket = connect_device(started.port, &identity.runner_id).await;
    let state = initiator(
        MODE_DAILY,
        &identity.runner_id,
        identity.static_public(),
        &random_key(),
        None,
    );
    let (_handshake, payload) = exchange(&mut socket, state, MODE_DAILY, b"{}")
        .await
        .expect("revoked message 2");
    assert_eq!(payload, br#"{"error":"device-revoked"}"#);
    match next_peer(&mut socket).await {
        PeerMsg::Closed(code) => assert_eq!(code, 1000),
        PeerMsg::Binary(_) => panic!("unpaired device stayed open"),
    }
    assert!(!started.dir.path().join("host/bridge/devices.json").exists());
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn revoke_notifies_the_live_channel_and_the_next_handshake() {
    let started = start().await;
    let ticket = issue(&started.bridge, &started.now, started.port);
    let device_private = random_key();
    let mut socket = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &device_private,
        Some(&ticket.psk),
    );
    let (handshake, payload) = exchange(
        &mut socket,
        state,
        MODE_PAIR,
        br#"{"name":"Desk","platform":"test"}"#,
    )
    .await
    .expect("pair");
    let device_id =
        serde_json::from_slice::<serde_json::Value>(&payload).expect("json")["deviceId"]
            .as_str()
            .expect("id")
            .to_string();
    let mut transport = handshake.into_transport_mode().expect("transport");
    let body = started
        .bridge
        .revoke(&device_id)
        .expect("revoke")
        .expect("known");
    assert!(body.devices.is_empty());

    let PeerMsg::Binary(revoked) = next_peer(&mut socket).await else {
        panic!("missing revoked");
    };
    assert_eq!(
        read_transport(&mut transport, &revoked),
        frames::stream(0, CONTROL, br#"{"type":"revoked"}"#)
    );
    match next_peer(&mut socket).await {
        PeerMsg::Closed(code) => assert_eq!(code, 1000),
        PeerMsg::Binary(_) => panic!("revoked channel stayed open"),
    }

    let mut again = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_DAILY,
        &ticket.runner_id,
        &ticket.static_public,
        &device_private,
        None,
    );
    let (_handshake, payload) = exchange(&mut again, state, MODE_DAILY, b"{}")
        .await
        .expect("next handshake");
    assert_eq!(payload, br#"{"error":"device-revoked"}"#);
    started.stop.store(true, Ordering::Relaxed);
}

// ---- A fake loopback dsh web -------------------------------------------------------------

#[derive(Default)]
struct DshState {
    session: Mutex<Option<String>>,
    connects: AtomicU32,
    attempts: AtomicU32,
    seen: Mutex<Vec<Seen>>,
    pongs: AtomicU32,
    opened: AtomicU32,
    closed: AtomicU32,
    cancelled: AtomicU32,
}

#[derive(Clone)]
struct Seen {
    path: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

struct Fake {
    port: u16,
    state: Arc<DshState>,
}

impl Fake {
    fn origin(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    fn login(&self) -> String {
        format!(
            "http://127.0.0.1:{}/connect?token=test-token&interactions=answer",
            self.port
        )
    }

    fn seen(&self, path: &str) -> Option<Seen> {
        self.state
            .seen
            .lock()
            .expect("seen")
            .iter()
            .rev()
            .find(|seen| seen.path == path)
            .cloned()
    }
}

fn dsh_source(dsh: &Fake) -> DshSource {
    let origin = dsh.origin();
    let login = dsh.login();
    Arc::new(move || {
        Some(DshEndpoint {
            origin: origin.clone(),
            login: login.clone(),
            generation: "g1".into(),
        })
    })
}

async fn fake_dsh() -> Fake {
    let state = Arc::new(DshState::default());
    let app = Router::new()
        .route("/connect", get(connect))
        .route("/api/echo", post(echo))
        .route("/api/setcookie", post(setcookie))
        .route("/api/unauthorized", post(unauthorized))
        .route("/api/refuse", post(refuse))
        .route("/api/large", post(large))
        .route("/api/slow", post(slow))
        .route("/api/remote.mux", get(mux))
        .with_state(state.clone());
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .expect("dsh bind");
    let port = listener.local_addr().expect("dsh addr").port();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    Fake { port, state }
}

async fn connect(
    State(state): State<Arc<DshState>>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    assert_eq!(
        query.get("token").map(String::as_str),
        Some("test-token"),
        "the login token the Host wrote"
    );
    let session = format!("s{}", state.connects.fetch_add(1, Ordering::SeqCst) + 1);
    *state.session.lock().expect("session") = Some(session.clone());
    // The real dsh answers its token-carrying root with 303; `/connect` answers 302.
    let mut response = (StatusCode::SEE_OTHER, "").into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        format!("session={session}; Path=/; HttpOnly")
            .parse()
            .expect("cookie"),
    );
    response
        .headers_mut()
        .insert(header::LOCATION, "/".parse().expect("location"));
    response
}

fn authorized(state: &DshState, headers: &HeaderMap) -> bool {
    let session = state.session.lock().expect("session").clone();
    let Some(session) = session else {
        return false;
    };
    let Some(cookie) = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    cookie
        .split("; ")
        .any(|pair| pair == format!("session={session}"))
}

fn remember(state: &DshState, path: &str, headers: &HeaderMap, body: &[u8]) {
    let mut seen = state.seen.lock().expect("seen");
    seen.push(Seen {
        path: path.to_string(),
        headers: headers
            .iter()
            .map(|(name, value)| {
                (
                    name.as_str().to_string(),
                    String::from_utf8_lossy(value.as_bytes()).into_owned(),
                )
            })
            .collect(),
        body: body.to_vec(),
    });
}

async fn echo(State(state): State<Arc<DshState>>, headers: HeaderMap, body: Bytes) -> Response {
    remember(&state, "/api/echo", &headers, &body);
    if !authorized(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut payload = b"echo:".to_vec();
    payload.extend_from_slice(&body);
    (StatusCode::OK, payload).into_response()
}

async fn setcookie(
    State(state): State<Arc<DshState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    remember(&state, "/api/setcookie", &headers, &body);
    if !authorized(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut response = (StatusCode::OK, b"echo:".to_vec()).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        "leaked=1; Path=/; HttpOnly".parse().expect("cookie"),
    );
    response
}

async fn unauthorized(
    State(state): State<Arc<DshState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    remember(&state, "/api/unauthorized", &headers, &body);
    if state.attempts.fetch_add(1, Ordering::SeqCst) == 0 {
        *state.session.lock().expect("session") = None;
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !authorized(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut payload = b"echo:".to_vec();
    payload.extend_from_slice(&body);
    (StatusCode::OK, payload).into_response()
}

/// Always answers 401 and drops the session, so the Bridge re-exchanges the Cookie and still fails.
async fn refuse(State(state): State<Arc<DshState>>, headers: HeaderMap, body: Bytes) -> Response {
    remember(&state, "/api/refuse", &headers, &body);
    *state.session.lock().expect("session") = None;
    StatusCode::UNAUTHORIZED.into_response()
}

async fn large(State(state): State<Arc<DshState>>, headers: HeaderMap, body: Bytes) -> Response {
    remember(&state, "/api/large", &headers, &body);
    if !authorized(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    (StatusCode::OK, "a".repeat(2 * 1024 * 1024)).into_response()
}

/// Streams ticks until the Device resets the stream; the guard counts an unfinished body.
struct SlowGuard {
    state: Arc<DshState>,
    finished: bool,
}

impl SlowGuard {
    fn finish(&mut self) {
        self.finished = true;
    }
}

impl Drop for SlowGuard {
    fn drop(&mut self) {
        if !self.finished {
            self.state.cancelled.fetch_add(1, Ordering::SeqCst);
        }
    }
}

async fn slow(State(state): State<Arc<DshState>>, headers: HeaderMap, body: Bytes) -> Response {
    remember(&state, "/api/slow", &headers, &body);
    if !authorized(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let guard = SlowGuard {
        state,
        finished: false,
    };
    let stream = futures_util::stream::unfold((guard, 0u32), |(mut guard, ticks)| async move {
        if ticks == 500 {
            guard.finish();
            return None;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
        Some((
            Ok::<_, std::io::Error>(Bytes::from_static(b"tick")),
            (guard, ticks + 1),
        ))
    });
    Response::builder()
        .status(StatusCode::OK)
        .body(axum::body::Body::from_stream(stream))
        .expect("slow response")
}

async fn mux(ws: WebSocketUpgrade, State(state): State<Arc<DshState>>) -> Response {
    ws.protocols(["mux.v1"]).on_upgrade(move |socket| {
        let state = state.clone();
        async move { serve_mux(socket, state).await }
    })
}

async fn serve_mux(socket: WebSocket, state: Arc<DshState>) {
    state.opened.fetch_add(1, Ordering::SeqCst);
    let (mut sink, mut stream) = futures_util::StreamExt::split(socket);
    let mut tick = tokio::time::interval(Duration::from_millis(50));
    loop {
        tokio::select! {
            _ = tick.tick() => {
                if sink.send(WsMessage::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
            message = futures_util::StreamExt::next(&mut stream) => match message {
                Some(Ok(WsMessage::Pong(_))) => {
                    state.pongs.fetch_add(1, Ordering::SeqCst);
                }
                Some(Ok(WsMessage::Text(text))) => {
                    let _ = sink.send(WsMessage::Text(format!("echo:{text}").into())).await;
                }
                Some(Ok(WsMessage::Binary(data))) => {
                    let mut payload = b"echo:".to_vec();
                    payload.extend_from_slice(&data);
                    let _ = sink.send(WsMessage::Binary(payload.into())).await;
                }
                Some(Ok(_)) => {}
                _ => break,
            },
        }
    }
    state.closed.fetch_add(1, Ordering::SeqCst);
}

// ---- Devices that speak the stream contract ----------------------------------------------

struct Device {
    socket: Socket,
    transport: snow::TransportState,
    device_id: String,
    private: [u8; 32],
}

/// Pairs a Device through the relay and keeps the channel open, so tests can open streams on
/// the transport the pairing left behind.
async fn paired_device(started: &Started) -> Device {
    let ticket = issue(&started.bridge, &started.now, started.port);
    let private = random_key();
    let mut socket = connect_device(started.port, &ticket.runner_id).await;
    let state = initiator(
        MODE_PAIR,
        &ticket.runner_id,
        &ticket.static_public,
        &private,
        Some(&ticket.psk),
    );
    let (handshake, payload) = exchange(
        &mut socket,
        state,
        MODE_PAIR,
        br#"{"name":"Desk","platform":"test"}"#,
    )
    .await
    .expect("pair");
    let device_id =
        serde_json::from_slice::<serde_json::Value>(&payload).expect("json")["deviceId"]
            .as_str()
            .expect("device id")
            .to_string();
    let transport = handshake.into_transport_mode().expect("transport");
    Device {
        socket,
        transport,
        device_id,
        private,
    }
}

impl Device {
    async fn send(&mut self, stream: u32, kind: u8, body: &[u8]) {
        let plain = frames::stream(stream, kind, body);
        let sealed = write_transport(&mut self.transport, &plain);
        self.socket
            .send(Message::binary(sealed))
            .await
            .expect("send stream frame");
    }

    async fn next(&mut self) -> (u32, u8, Vec<u8>) {
        let PeerMsg::Binary(bytes) = next_peer(&mut self.socket).await else {
            panic!("the relay channel closed");
        };
        let plain = read_transport(&mut self.transport, &bytes);
        let (stream, kind, body) = frames::parse_stream(&plain).expect("stream frame");
        (stream, kind, body.to_vec())
    }
}

async fn http_response(device: &mut Device, stream: u32) -> (u16, Vec<(String, String)>, Vec<u8>) {
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (stream, HTTP_RESPONSE));
    let head: serde_json::Value = serde_json::from_slice(&body).expect("response json");
    let status = head["status"].as_u64().expect("status") as u16;
    let headers = head["headers"]
        .as_array()
        .expect("headers")
        .iter()
        .map(|pair| {
            (
                pair[0].as_str().unwrap_or_default().to_string(),
                pair[1].as_str().unwrap_or_default().to_string(),
            )
        })
        .collect::<Vec<_>>();
    let mut body = Vec::new();
    loop {
        let (id, kind, chunk) = device.next().await;
        assert_eq!(id, stream);
        match kind {
            BODY => body.extend_from_slice(&chunk),
            END => return (status, headers, body),
            other => panic!("unexpected stream frame {other}"),
        }
    }
}

async fn wait_until(mut check: impl FnMut() -> bool, what: &str) {
    for _ in 0..200 {
        if check() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("timed out waiting for {what}");
}

fn echo_head() -> Vec<u8> {
    serde_json::json!({ "method": "POST", "path": "/api/echo", "headers": [] })
        .to_string()
        .into_bytes()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn http_post_round_trip_reaches_the_dsh_web() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({
        "method": "POST",
        "path": "/api/echo",
        "headers": [
            ["Cookie", "session=device-secret"],
            ["Authorization", "Bearer device-secret"],
            ["Origin", "http://evil.example"],
            ["Host", "evil.example"],
            ["X-Kept", "yes"],
        ],
    });
    device
        .send(1, HTTP_REQUEST, head.to_string().as_bytes())
        .await;
    device.send(1, BODY, b"hello ").await;
    device.send(1, BODY, b"world").await;
    device.send(1, END, b"").await;

    let (status, headers, body) = http_response(&mut device, 1).await;
    assert_eq!(status, 200);
    assert_eq!(body, b"echo:hello world");
    assert!(
        headers.iter().all(|(name, _)| name != "set-cookie"),
        "{headers:?}"
    );

    let seen = started.dsh.seen("/api/echo").expect("dsh saw the request");
    assert_eq!(seen.body, b"hello world");
    let header = |wanted: &str| {
        seen.headers
            .iter()
            .find(|(name, _)| name == wanted)
            .map(|(_, value)| value.as_str())
    };
    assert_eq!(header("x-kept"), Some("yes"));
    assert!(
        header("authorization").is_none(),
        "the Device's credentials stay behind"
    );
    assert!(header("origin").is_none());
    assert_eq!(
        header("host"),
        Some(format!("127.0.0.1:{}", started.dsh.port).as_str())
    );
    let cookie = header("cookie").expect("Bridge's own Cookie");
    assert!(cookie.starts_with("session=s"), "{cookie}");
    assert!(!cookie.contains("device-secret"));
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn http_refuses_paths_and_methods_outside_the_api() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let requests = [
        (
            1,
            serde_json::json!({"method": "GET", "path": "/api/echo", "headers": []}),
        ),
        (
            3,
            serde_json::json!({"method": "POST", "path": "/connect?token=x", "headers": []}),
        ),
        (
            5,
            serde_json::json!({"method": "POST", "path": "/pair", "headers": []}),
        ),
        (
            7,
            serde_json::json!({"method": "POST", "path": "//api/echo", "headers": []}),
        ),
    ];
    for (stream, head) in requests {
        device
            .send(stream, HTTP_REQUEST, head.to_string().as_bytes())
            .await;
        let (id, kind, body) = device.next().await;
        assert_eq!((id, kind), (stream, RESET));
        assert_eq!(body, br#"{"code":"forbidden"}"#, "stream {stream}");
    }
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn http_response_carries_no_set_cookie() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({"method": "POST", "path": "/api/setcookie", "headers": []});
    device
        .send(1, HTTP_REQUEST, head.to_string().as_bytes())
        .await;
    device.send(1, END, b"").await;
    let (status, headers, body) = http_response(&mut device, 1).await;
    assert_eq!(status, 200);
    assert_eq!(body, b"echo:");
    assert!(
        headers.iter().all(|(name, _)| name != "set-cookie"),
        "{headers:?}"
    );
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn http_reports_unavailable_when_the_cookie_keeps_failing() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({"method": "POST", "path": "/api/refuse", "headers": []});
    device
        .send(1, HTTP_REQUEST, head.to_string().as_bytes())
        .await;
    device.send(1, BODY, b"no-good").await;
    device.send(1, END, b"").await;
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (1, RESET));
    assert_eq!(body, br#"{"code":"unavailable"}"#);
    assert_eq!(
        started.dsh.state.connects.load(Ordering::SeqCst),
        2,
        "the Bridge re-exchanged the Cookie exactly once before giving up"
    );
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn http_re_exchanges_the_cookie_after_unauthorized() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({"method": "POST", "path": "/api/unauthorized", "headers": []});
    device
        .send(1, HTTP_REQUEST, head.to_string().as_bytes())
        .await;
    device.send(1, BODY, b"retry-me").await;
    device.send(1, END, b"").await;

    let (status, _, body) = http_response(&mut device, 1).await;
    assert_eq!(status, 200, "the retried request succeeded");
    assert_eq!(body, b"echo:retry-me");
    assert_eq!(
        started.dsh.state.connects.load(Ordering::SeqCst),
        2,
        "a 401 exchanges the Cookie exactly once more"
    );
    let seen = started.dsh.state.seen.lock().expect("seen");
    let attempts = seen
        .iter()
        .filter(|seen| seen.path == "/api/unauthorized")
        .collect::<Vec<_>>();
    assert_eq!(attempts.len(), 2);
    assert_eq!(attempts[0].body, b"retry-me");
    assert_eq!(attempts[1].body, b"retry-me", "the body was replayed");
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ws_mux_round_trip_carries_fragments() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({"path": "/api/remote.mux", "protocols": ["mux.v1"]});
    device.send(1, WS_OPEN, head.to_string().as_bytes()).await;
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (1, WS_ACCEPT));
    let accept: serde_json::Value = serde_json::from_slice(&body).expect("accept json");
    assert_eq!(accept["protocol"], "mux.v1");

    device.send(1, WS_TEXT, b"\x00he").await;
    device.send(1, WS_TEXT, b"\x01llo").await;
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (1, WS_TEXT));
    assert_eq!(body[0], 1, "the last fragment carries fin");
    assert_eq!(&body[1..], b"echo:hello");

    device.send(1, WS_BINARY, b"\x01bin").await;
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (1, WS_BINARY));
    assert_eq!(body[0], 1);
    assert_eq!(&body[1..], b"echo:bin");
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ws_bridge_answers_mux_pings_without_the_device() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({"path": "/api/remote.mux", "protocols": []});
    device.send(1, WS_OPEN, head.to_string().as_bytes()).await;
    let (id, kind, _) = device.next().await;
    assert_eq!((id, kind), (1, WS_ACCEPT));

    tokio::time::sleep(Duration::from_millis(400)).await;
    let pongs = started.dsh.state.pongs.load(Ordering::SeqCst);
    assert!(pongs >= 2, "Bridge answered only {pongs} of dsh's pings");
    assert_eq!(
        started.dsh.state.closed.load(Ordering::SeqCst),
        0,
        "the Device sent no heartbeat and its mux must stay open"
    );
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ws_stream_end_closes_the_loopback_mux() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({"path": "/api/remote.mux", "protocols": []});
    device.send(1, WS_OPEN, head.to_string().as_bytes()).await;
    let (_, kind, _) = device.next().await;
    assert_eq!(kind, WS_ACCEPT);
    device
        .send(1, WS_CLOSE, br#"{"code":1000,"reason":"bye"}"#)
        .await;
    wait_until(
        || started.dsh.state.closed.load(Ordering::SeqCst) == 1,
        "dsh to close the loopback mux",
    )
    .await;

    device.send(3, WS_OPEN, head.to_string().as_bytes()).await;
    let (_, kind, _) = device.next().await;
    assert_eq!(kind, WS_ACCEPT);
    device.send(3, RESET, br#"{"code":"protocol"}"#).await;
    wait_until(
        || started.dsh.state.closed.load(Ordering::SeqCst) == 2,
        "a reset stream to close its loopback mux",
    )
    .await;
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn device_reset_cancels_the_loopback_request() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({"method": "POST", "path": "/api/slow", "headers": []});
    device
        .send(1, HTTP_REQUEST, head.to_string().as_bytes())
        .await;
    device.send(1, END, b"").await;
    let (id, kind, _) = device.next().await;
    assert_eq!((id, kind), (1, HTTP_RESPONSE));
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (1, BODY));
    assert_eq!(body, b"tick");

    device.send(1, RESET, br#"{"code":"cancelled"}"#).await;
    wait_until(
        || started.dsh.state.cancelled.load(Ordering::SeqCst) == 1,
        "the loopback request to be cancelled",
    )
    .await;
    assert!(
        tokio::time::timeout(Duration::from_millis(300), device.next())
            .await
            .is_err(),
        "the bridge must not answer a device reset"
    );
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stream_ids_must_be_odd_and_increasing() {
    let started = start().await;
    let mut device = paired_device(&started).await;

    device.send(4, HTTP_REQUEST, &echo_head()).await;
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (4, RESET));
    assert_eq!(body, br#"{"code":"protocol"}"#);

    device.send(5, BODY, b"x").await;
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (5, RESET));
    assert_eq!(
        body, br#"{"code":"protocol"}"#,
        "a frame cannot open a stream"
    );

    device.send(1, HTTP_REQUEST, &echo_head()).await;
    device.send(1, END, b"").await;
    let (status, _, body) = http_response(&mut device, 1).await;
    assert_eq!(status, 200);
    assert_eq!(body, b"echo:");

    device.send(1, HTTP_REQUEST, &echo_head()).await;
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (1, RESET));
    assert_eq!(body, br#"{"code":"protocol"}"#, "a stream id is used once");
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stream_backlog_over_the_limit_resets_the_stream() {
    use tokio::sync::mpsc::unbounded_channel;

    let started = start().await;
    let device = paired_device(&started).await;
    let identity = started.bridge.identity().expect("identity");
    // The same Device key, so `begin_daily` finds the paired record. Its relay channel is
    // bypassed on purpose: the test drives a `channel::run` directly and never reads `out_rx`.
    let mut initiator = initiator(
        MODE_DAILY,
        &identity.runner_id,
        identity.static_public(),
        &device.private,
        None,
    );
    let first = write_handshake(&mut initiator, b"{}");
    let (tx, rx) = unbounded_channel::<Inbound>();
    let (out_tx, mut out_rx) = unbounded_channel::<OutFrame>();
    tokio::spawn(channel::run(
        started.bridge.clone(),
        77,
        tx.clone(),
        rx,
        out_tx,
    ));

    let mut hello = vec![MODE_DAILY];
    hello.extend(first);
    tx.send(Inbound::Data(hello)).expect("handshake");
    let second = out_rx.recv().await.expect("message 2");
    let Some(frames::RelayFrame::Data { payload, .. }) = frames::decode(&second.bytes) else {
        panic!("message 2 arrived as {:?}", second.bytes.len());
    };
    let payload = read_handshake(&mut initiator, &payload);
    assert_eq!(payload, br#"{"ok":true}"#);
    let mut transport = initiator.into_transport_mode().expect("transport");

    let head = serde_json::json!({"method": "POST", "path": "/api/large", "headers": []});
    let request = frames::stream(1, HTTP_REQUEST, head.to_string().as_bytes());
    tx.send(Inbound::Data(write_transport(&mut transport, &request)))
        .expect("request");
    let end = frames::stream(1, END, b"");
    tx.send(Inbound::Data(write_transport(&mut transport, &end)))
        .expect("end");

    // Nothing drains these frames, so the stream's backlog grows past the contract's limit.
    let reset = loop {
        let frame = tokio::time::timeout(Duration::from_secs(10), out_rx.recv())
            .await
            .expect("the stream is reset, not left to grow")
            .expect("frame");
        let Some(frames::RelayFrame::Data { payload, .. }) = frames::decode(&frame.bytes) else {
            panic!("a stream frame must be relay data");
        };
        let plain = read_transport(&mut transport, &payload);
        let (id, kind, body) = frames::parse_stream(&plain).expect("stream frame");
        assert_eq!(id, 1);
        if kind == RESET {
            break body.to_vec();
        }
    };
    assert_eq!(reset, br#"{"code":"overloaded"}"#);
    started.stop.store(true, Ordering::Relaxed);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn revoking_a_device_closes_its_open_streams() {
    let started = start().await;
    let mut device = paired_device(&started).await;
    let head = serde_json::json!({"path": "/api/remote.mux", "protocols": []});
    device.send(1, WS_OPEN, head.to_string().as_bytes()).await;
    let (_, kind, _) = device.next().await;
    assert_eq!(kind, WS_ACCEPT);

    started
        .bridge
        .revoke(&device.device_id)
        .expect("revoke")
        .expect("known device");
    let (id, kind, body) = device.next().await;
    assert_eq!((id, kind), (0, CONTROL));
    assert_eq!(body, br#"{"type":"revoked"}"#);
    match next_peer(&mut device.socket).await {
        PeerMsg::Closed(code) => assert_eq!(code, 1000),
        PeerMsg::Binary(_) => panic!("a revoked channel stays open"),
    }
    wait_until(
        || started.dsh.state.closed.load(Ordering::SeqCst) == 1,
        "revocation to close the loopback mux",
    )
    .await;
    started.stop.store(true, Ordering::Relaxed);
}
