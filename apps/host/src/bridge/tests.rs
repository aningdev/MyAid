//! Fake Relay and a snow Device. They exist only so Bridge can be tested; nothing here is the
//! product Relay.

use super::{
    Bridge, DEFAULT_RELAY_URL, encode, frames,
    frames::{CONTROL, MODE_DAILY, MODE_PAIR, RESET},
    identity, noise,
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
}

async fn start() -> Started {
    let relay = Relay::bind().await;
    let dir = tempfile::tempdir().expect("tempdir");
    let now = Arc::new(AtomicU64::new(1_800_000_000));
    let url = format!("ws://127.0.0.1:{}", relay.port);
    let bridge = Bridge::open_for_test(dir.path(), Some(&url), now.clone());
    let stop = Arc::new(AtomicBool::new(false));
    bridge.spawn(stop.clone());
    wait_connected(&bridge).await;
    Started {
        dir,
        now,
        bridge,
        stop,
        port: relay.port,
    }
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

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn unset_or_placeholder_relay_is_not_dialed() {
    let dir = tempfile::tempdir().expect("tempdir");
    let now = Arc::new(AtomicU64::new(1_800_000_000));
    for setting in [None, Some(""), Some(DEFAULT_RELAY_URL), Some("not a url")] {
        let bridge = Bridge::open_for_test(dir.path(), setting, now.clone());
        bridge.spawn(Arc::new(AtomicBool::new(false)));
        tokio::time::sleep(Duration::from_millis(30)).await;
        let body = bridge.devices().expect("devices");
        assert!(!body.relay.configured);
        assert!(!body.relay.connected);
        let reason = body.relay.reason.expect("reason");
        assert!(
            reason.contains("DEFAULT_RELAY_URL") || reason.contains("not a usable"),
            "{reason}"
        );
    }
    assert!(!dir.path().join("host/bridge/identity.json").exists());
    let broken = Bridge::open_for_test(dir.path(), Some("ftp://relay.example"), now);
    assert!(!broken.devices().expect("devices").relay.configured);
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
    let again = Bridge::open_for_test(started.dir.path(), None, started.now.clone());
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

    let other = frames::stream(4, CONTROL, b"{}");
    socket
        .send(Message::binary(write_transport(&mut transport, &other)))
        .await
        .expect("other stream");
    let PeerMsg::Binary(reset) = next_peer(&mut socket).await else {
        panic!("missing reset");
    };
    assert_eq!(
        read_transport(&mut transport, &reset),
        frames::stream(4, RESET, br#"{"code":"forbidden"}"#)
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
