//! The Relay's forwarding protocol over real sockets: registration, channels,
//! close codes and limits. Each test starts a real `dsh-bot-relay`.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, StreamExt};
use sha2::{Digest, Sha256};
use std::{
    io::{BufRead, BufReader, Read},
    path::Path,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tokio::{net::TcpStream as TokioTcpStream, time::timeout};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async,
    tungstenite::{Message, client::IntoClientRequest, http::HeaderValue},
};

const PREFIX: &[u8] = b"dsh-bot-relay/1 runner\n";
const OPEN: u8 = 1;
const DATA: u8 = 2;
const CLOSE: u8 = 3;

struct Relay {
    child: Child,
    port: u16,
}

impl Drop for Relay {
    fn drop(&mut self) {
        #[cfg(unix)]
        unsafe {
            libc::kill(self.child.id() as i32, libc::SIGTERM);
        }
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            if self.child.try_wait().ok().flatten().is_some() {
                return;
            }
            thread::sleep(Duration::from_millis(20));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Relay {
    fn start(tap: Option<&Path>) -> Self {
        Self::start_with(tap, &[])
    }

    fn start_with(tap: Option<&Path>, extra: &[&str]) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_dsh-bot-relay"));
        command.args(["serve", "--port", "0", "--ready-stdout"]);
        command.args(extra);
        if let Some(tap) = tap {
            command.arg("--frame-tap").arg(tap);
        }
        let mut child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn dsh-bot-relay");
        let stdout = child.stdout.take().expect("stdout");
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line).expect("ready line");
        let ready: serde_json::Value = serde_json::from_str(line.trim()).expect("ready json");
        assert_eq!(ready["event"], "ready");
        let port = ready["port"].as_u64().expect("port") as u16;
        thread::spawn(move || {
            let mut sink = Vec::new();
            let _ = reader.read_to_end(&mut sink);
        });
        Self { child, port }
    }

    fn url(&self, path: &str) -> String {
        format!("ws://127.0.0.1:{}{path}", self.port)
    }
}

type Client = WebSocketStream<MaybeTlsStream<TokioTcpStream>>;

async fn connect(url: &str) -> Client {
    connect_forwarded(url, None).await
}

async fn connect_forwarded(url: &str, forwarded_for: Option<&str>) -> Client {
    let mut request = url.into_client_request().expect("device url");
    if let Some(forwarded_for) = forwarded_for {
        request.headers_mut().insert(
            "x-forwarded-for",
            HeaderValue::from_str(forwarded_for).expect("forwarded header"),
        );
    }
    let (socket, _) = timeout(Duration::from_secs(10), connect_async(request))
        .await
        .expect("relay answered the upgrade")
        .expect("websocket handshake");
    socket
}

/// Close code of one `/v1/device` attempt. `4001` passed the rate limit with no
/// runner; `4005` was refused.
async fn device_close(url: &str, forwarded_for: Option<&str>) -> u16 {
    let mut socket = connect_forwarded(url, forwarded_for).await;
    next_close(&mut socket).await
}

/// The first `connect_rate` attempts must pass. Clients rotate through `forwarded_for`.
async fn fill_device_rate(url: &str, forwarded_for: &[&str]) {
    let limit = dsh_bot_relay::Limits::default().connect_rate as usize;
    for index in 0..limit {
        let code = device_close(url, Some(forwarded_for[index % forwarded_for.len()])).await;
        assert_eq!(code, 4001, "connection {index}");
    }
}

fn identity(seed: u8) -> (SigningKey, String) {
    let key = SigningKey::from_bytes(&[seed; 32]);
    let digest = Sha256::digest(key.verifying_key().to_bytes());
    let id = data_encoding::BASE32_NOPAD
        .encode(&digest[..20])
        .to_ascii_lowercase();
    (key, id)
}

/// Register a Runner with `key` and return its link and the id the Relay gave it.
async fn register(relay: &Relay, key: &SigningKey, expected: Option<&str>) -> (Client, String) {
    let mut socket = connect(&relay.url("/v1/runner")).await;
    let challenge = next_text(&mut socket).await;
    let challenge: serde_json::Value = serde_json::from_str(&challenge).expect("challenge json");
    assert_eq!(challenge["type"], "challenge");
    let nonce = URL_SAFE_NO_PAD
        .decode(challenge["nonce"].as_str().expect("nonce"))
        .expect("nonce base64");
    let mut message = PREFIX.to_vec();
    message.extend_from_slice(&nonce);
    let hello = serde_json::json!({
        "type": "hello",
        "protocol": 1,
        "key": URL_SAFE_NO_PAD.encode(key.verifying_key().to_bytes()),
        "sig": URL_SAFE_NO_PAD.encode(key.sign(&message).to_bytes()),
    });
    socket
        .send(Message::Text(hello.to_string().into()))
        .await
        .expect("send hello");
    let ready = next_text(&mut socket).await;
    let ready: serde_json::Value = serde_json::from_str(&ready).expect("ready json");
    assert_eq!(ready["type"], "ready", "{ready}");
    let id = ready["runner"].as_str().expect("runner id").to_string();
    if let Some(expected) = expected {
        assert_eq!(id, expected);
    }
    (socket, id)
}

async fn next(socket: &mut Client) -> Option<Message> {
    loop {
        match timeout(Duration::from_secs(20), socket.next())
            .await
            .expect("relay did not answer in time")?
        {
            Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => continue,
            Ok(message) => return Some(message),
            Err(_) => return None,
        }
    }
}

async fn next_text(socket: &mut Client) -> String {
    match next(socket).await {
        Some(Message::Text(text)) => text.to_string(),
        other => panic!("expected a text frame, got {other:?}"),
    }
}

async fn next_binary(socket: &mut Client) -> Vec<u8> {
    match next(socket).await {
        Some(Message::Binary(bytes)) => bytes.to_vec(),
        other => panic!("expected a binary frame, got {other:?}"),
    }
}

/// The close code the relay sent, from the close frame or the error that follows.
async fn next_close(socket: &mut Client) -> u16 {
    match next(socket).await {
        Some(Message::Close(Some(frame))) => frame.code.into(),
        Some(Message::Close(None)) => 1005,
        other => panic!("expected a close frame, got {other:?}"),
    }
}

fn frame(channel: u32, kind: u8, payload: &[u8]) -> Vec<u8> {
    let mut bytes = channel.to_be_bytes().to_vec();
    bytes.push(kind);
    bytes.extend_from_slice(payload);
    bytes
}

fn close_frame(channel: u32, code: u16) -> Vec<u8> {
    frame(channel, CLOSE, &code.to_be_bytes())
}

fn decode(bytes: &[u8]) -> (u32, u8, Vec<u8>) {
    assert!(bytes.len() >= 5, "short frame {bytes:?}");
    (
        u32::from_be_bytes(bytes[0..4].try_into().expect("channel")),
        bytes[4],
        bytes[5..].to_vec(),
    )
}

/// The channel a freshly opened Device gets: the Bridge sees `OPEN` for it.
async fn open_device(relay: &Relay, runner: &str, bridge: &mut Client) -> (Client, u32) {
    let device = connect(&relay.url(&format!("/v1/device?runner={runner}"))).await;
    let opened = next_binary(bridge).await;
    let (channel, kind, payload) = decode(&opened);
    assert_eq!(kind, OPEN);
    assert!(payload.is_empty());
    (device, channel)
}

#[tokio::test]
async fn runner_registration_answers_the_challenge_with_its_public_id() {
    let relay = Relay::start(None);
    let (key, id) = identity(7);
    let (_bridge, registered) = register(&relay, &key, Some(&id)).await;
    assert_eq!(registered, id);
    assert_eq!(registered.len(), 32);
}

#[tokio::test]
async fn runner_registration_with_a_bad_signature_closes_4004() {
    let relay = Relay::start(None);
    let (key, _) = identity(1);
    let (other, _) = identity(2);
    let mut socket = connect(&relay.url("/v1/runner")).await;
    let challenge = next_text(&mut socket).await;
    let challenge: serde_json::Value = serde_json::from_str(&challenge).expect("challenge json");
    let nonce = URL_SAFE_NO_PAD
        .decode(challenge["nonce"].as_str().expect("nonce"))
        .expect("nonce base64");
    let mut message = PREFIX.to_vec();
    message.extend_from_slice(&nonce);
    let hello = serde_json::json!({
        "type": "hello",
        "protocol": 1,
        "key": URL_SAFE_NO_PAD.encode(key.verifying_key().to_bytes()),
        "sig": URL_SAFE_NO_PAD.encode(other.sign(&message).to_bytes()),
    });
    socket
        .send(Message::Text(hello.to_string().into()))
        .await
        .expect("send hello");
    assert_eq!(next_close(&mut socket).await, 4004);
}

#[tokio::test]
async fn a_new_registration_replaces_the_older_runner_link() {
    let relay = Relay::start(None);
    let (key, id) = identity(3);
    let (mut first, _) = register(&relay, &key, Some(&id)).await;
    let (_second, _) = register(&relay, &key, Some(&id)).await;
    assert_eq!(next_close(&mut first).await, 4002);
}

#[tokio::test]
async fn a_device_without_its_runner_closes_4001() {
    let relay = Relay::start(None);
    let (_key, id) = identity(4);
    let mut device = connect(&relay.url(&format!("/v1/device?runner={id}"))).await;
    assert_eq!(next_close(&mut device).await, 4001);

    let mut device = connect(&relay.url("/v1/device")).await;
    assert_eq!(next_close(&mut device).await, 4001);
}

#[tokio::test]
async fn frames_travel_both_ways_between_device_and_bridge() {
    let relay = Relay::start(None);
    let (key, _) = identity(5);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut device, channel) = open_device(&relay, &id, &mut bridge).await;

    device
        .send(Message::Binary(b"from-device".to_vec().into()))
        .await
        .expect("send from device");
    let (seen, kind, payload) = decode(&next_binary(&mut bridge).await);
    assert_eq!(
        (seen, kind, payload.as_slice()),
        (channel, DATA, &b"from-device"[..])
    );

    bridge
        .send(Message::Binary(frame(channel, DATA, b"from-bridge").into()))
        .await
        .expect("send from bridge");
    assert_eq!(next_binary(&mut device).await, b"from-bridge");

    bridge
        .send(Message::Binary(close_frame(channel, 1000).into()))
        .await
        .expect("close the channel");
    assert_eq!(next_close(&mut device).await, 1000);
}

#[tokio::test]
async fn two_devices_keep_their_own_channels_and_payloads() {
    let relay = Relay::start(None);
    let (key, _) = identity(6);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut first, first_channel) = open_device(&relay, &id, &mut bridge).await;
    let (mut second, second_channel) = open_device(&relay, &id, &mut bridge).await;
    assert_ne!(first_channel, second_channel);

    first
        .send(Message::Binary(b"one".to_vec().into()))
        .await
        .expect("send from the first device");
    second
        .send(Message::Binary(b"two".to_vec().into()))
        .await
        .expect("send from the second device");
    let mut seen = Vec::new();
    for _ in 0..2 {
        seen.push(decode(&next_binary(&mut bridge).await));
    }
    seen.sort_by_key(|(channel, ..)| *channel);
    assert_eq!(seen[0], (first_channel, DATA, b"one".to_vec()));
    assert_eq!(seen[1], (second_channel, DATA, b"two".to_vec()));

    bridge
        .send(Message::Binary(
            frame(first_channel, DATA, b"only-one").into(),
        ))
        .await
        .expect("send to the first device");
    assert_eq!(next_binary(&mut first).await, b"only-one");
}

#[tokio::test]
async fn a_runner_disconnect_closes_its_device_4001() {
    let relay = Relay::start(None);
    let (key, _) = identity(8);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut device, _) = open_device(&relay, &id, &mut bridge).await;
    bridge
        .send(Message::Close(None))
        .await
        .expect("close the bridge");
    assert_eq!(next_close(&mut device).await, 4001);
}

#[tokio::test]
async fn a_bridge_close_code_reaches_the_device() {
    let relay = Relay::start(None);
    let (key, _) = identity(9);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut device, channel) = open_device(&relay, &id, &mut bridge).await;
    bridge
        .send(Message::Binary(close_frame(channel, 4010).into()))
        .await
        .expect("close the channel");
    assert_eq!(next_close(&mut device).await, 4010);
}

#[tokio::test]
async fn an_invalid_bridge_close_code_closes_1011() {
    let relay = Relay::start(None);
    let (key, _) = identity(10);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut device, channel) = open_device(&relay, &id, &mut bridge).await;
    bridge
        .send(Message::Binary(close_frame(channel, 2000).into()))
        .await
        .expect("close the channel");
    assert_eq!(next_close(&mut device).await, 1011);
}

#[tokio::test]
async fn an_oversized_device_message_closes_4003() {
    let relay = Relay::start(None);
    let (key, _) = identity(11);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut device, _) = open_device(&relay, &id, &mut bridge).await;
    device
        .send(Message::Binary(vec![0u8; 65_596].into()))
        .await
        .expect("send an oversized message");
    assert_eq!(next_close(&mut device).await, 4003);
}

#[tokio::test]
async fn a_backlog_above_the_limit_closes_4003() {
    let relay = Relay::start(None);
    let (key, _) = identity(12);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut device, channel) = open_device(&relay, &id, &mut bridge).await;

    // The device does not read, so the relay queues until the backlog cap.
    let payload = vec![7u8; 60 * 1024];
    let mut closed = None;
    for _ in 0..200 {
        if bridge
            .send(Message::Binary(frame(channel, DATA, &payload).into()))
            .await
            .is_err()
        {
            break;
        }
    }
    for _ in 0..200 {
        match timeout(Duration::from_secs(5), device.next()).await {
            Ok(Some(Ok(Message::Close(Some(frame))))) => {
                closed = Some(u16::from(frame.code));
                break;
            }
            Ok(Some(Ok(_))) => continue,
            Ok(Some(Err(_))) | Ok(None) => break,
            Err(_) => break,
        }
    }
    assert_eq!(closed, Some(4003));
}

#[tokio::test]
async fn a_device_that_never_sends_closes_4006() {
    let relay = Relay::start(None);
    let (key, _) = identity(13);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut device, _) = open_device(&relay, &id, &mut bridge).await;
    let started = Instant::now();
    assert_eq!(next_close(&mut device).await, 4006);
    assert!(started.elapsed() >= Duration::from_secs(9));
}

#[cfg(feature = "frame-tap")]
#[tokio::test]
async fn the_frame_tap_records_every_relayed_frame() {
    let directory = tempfile::tempdir().expect("tempdir");
    let path = directory.path().join("frames.jsonl");
    let relay = Relay::start(Some(&path));
    let (key, _) = identity(14);
    let (mut bridge, id) = register(&relay, &key, None).await;
    let (mut device, channel) = open_device(&relay, &id, &mut bridge).await;
    device
        .send(Message::Binary(b"opaque-device-payload".to_vec().into()))
        .await
        .expect("send from device");
    assert_eq!(
        next_binary(&mut bridge).await,
        frame(channel, DATA, b"opaque-device-payload")
    );
    bridge
        .send(Message::Binary(
            frame(channel, DATA, b"opaque-bridge-payload").into(),
        ))
        .await
        .expect("send from bridge");
    assert_eq!(next_binary(&mut device).await, b"opaque-bridge-payload");

    // A Device that closes normally becomes a `CLOSE` frame towards the Bridge.
    device
        .send(Message::Close(None))
        .await
        .expect("close the device");
    let (channel_seen, kind, payload) = decode(&next_binary(&mut bridge).await);
    assert_eq!(
        (channel_seen, kind, payload),
        (channel, CLOSE, 1000u16.to_be_bytes().to_vec())
    );

    let text = std::fs::read_to_string(&path).expect("tap file");
    let frames: Vec<(String, String, Vec<u8>)> = text
        .lines()
        .map(|line| {
            let value: serde_json::Value = serde_json::from_str(line).expect("tap line");
            (
                value["link"].as_str().expect("link").to_string(),
                value["dir"].as_str().expect("dir").to_string(),
                URL_SAFE_NO_PAD
                    .decode(value["bytes"].as_str().expect("bytes"))
                    .expect("tap bytes"),
            )
        })
        .collect();
    assert_eq!(frames.len(), 6, "{frames:?}");
    assert_eq!(
        frames[0],
        ("bridge".into(), "out".into(), frame(channel, OPEN, &[]))
    );
    assert_eq!(
        frames[1],
        (
            "device".into(),
            "in".into(),
            b"opaque-device-payload".to_vec()
        )
    );
    assert_eq!(
        frames[2],
        (
            "bridge".into(),
            "out".into(),
            frame(channel, DATA, b"opaque-device-payload")
        )
    );
    assert_eq!(
        frames[3],
        (
            "bridge".into(),
            "in".into(),
            frame(channel, DATA, b"opaque-bridge-payload")
        )
    );
    assert_eq!(
        frames[4],
        (
            "device".into(),
            "out".into(),
            b"opaque-bridge-payload".to_vec()
        )
    );
    assert_eq!(
        frames[5],
        ("bridge".into(), "out".into(), close_frame(channel, 1000))
    );
    assert!(!text.contains("opaque-device-payload"));
}

#[tokio::test]
async fn a_trusted_proxy_gives_each_forwarded_client_its_own_rate_limit() {
    let relay = Relay::start_with(None, &["--trusted-proxy", "127.0.0.1"]);
    let url = relay.url("/v1/device");
    fill_device_rate(&url, &["203.0.113.10"]).await;
    assert_eq!(device_close(&url, Some("203.0.113.10")).await, 4005);
    assert_eq!(device_close(&url, Some("203.0.113.20")).await, 4001);
}

#[tokio::test]
async fn forged_forwarded_for_shares_the_peer_rate_limit() {
    let relay = Relay::start(None);
    let url = relay.url("/v1/device");
    fill_device_rate(&url, &["203.0.113.10", "203.0.113.20", "203.0.113.30"]).await;
    assert_eq!(device_close(&url, Some("198.51.100.8")).await, 4005);
}
