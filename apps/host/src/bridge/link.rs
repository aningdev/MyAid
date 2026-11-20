//! The runner's WebSocket to Relay: challenge, then channel frames, then backoff.

use super::{
    Bridge,
    channel::{self, Inbound},
    encode, frames,
    frames::RelayFrame,
};
use crate::Result;
use futures_util::{SinkExt, StreamExt};
use std::{collections::HashMap, time::Duration};
use tokio::sync::mpsc::{UnboundedSender, unbounded_channel};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream,
    tungstenite::{Message, protocol::WebSocketConfig},
};

type Socket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const FRAME_LIMIT: usize = 65_600;

pub(super) async fn run(bridge: Bridge, stop: std::sync::Arc<std::sync::atomic::AtomicBool>) {
    let Some(ws) = bridge.runner_url() else {
        return;
    };
    if bridge.devices_unreadable() {
        return;
    }
    let mut delay = Duration::from_secs(1);
    loop {
        if stopped(&stop) {
            return;
        }
        bridge.set_link(false, Some("connecting".into()));
        let ended = session(&bridge, &ws, &stop).await;
        bridge.mark_all_offline();
        if stopped(&stop) {
            return;
        }
        let reason = match ended {
            Ok(()) => "relay connection ended".into(),
            Err(error) => error,
        };
        tracing::warn!(error = %reason, "bridge relay");
        bridge.set_link(false, Some(reason));
        let wait = delay;
        delay = (delay * 2).min(Duration::from_secs(60));
        tokio::select! {
            () = tokio::time::sleep(wait) => {}
            () = wait_stop(&stop) => return,
        }
    }
}

async fn session(
    bridge: &Bridge,
    url: &url::Url,
    stop: &std::sync::atomic::AtomicBool,
) -> Result<()> {
    if url.scheme() == "wss" {
        // rustls has no provider until one crate feature installs it. See Cargo.toml.
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let config = WebSocketConfig::default()
        .max_message_size(Some(FRAME_LIMIT))
        .max_frame_size(Some(FRAME_LIMIT));
    let (mut socket, _) = tokio::time::timeout(
        CONNECT_TIMEOUT,
        tokio_tungstenite::connect_async_with_config(url.as_str(), Some(config), true),
    )
    .await
    .map_err(|_| "relay connect timed out".to_string())?
    .map_err(|error| error.to_string())?;
    register(bridge, &mut socket).await?;
    bridge.set_link(true, None);
    let (out_tx, mut out_rx) = unbounded_channel::<Vec<u8>>();
    let mut sessions: HashMap<u32, UnboundedSender<Inbound>> = HashMap::new();
    loop {
        tokio::select! {
            () = wait_stop(stop) => break,
            outgoing = out_rx.recv() => {
                let Some(frame) = outgoing else { break };
                socket
                    .send(Message::binary(frame))
                    .await
                    .map_err(|error| error.to_string())?;
            }
            incoming = socket.next() => match incoming {
                Some(Ok(Message::Binary(bytes))) => {
                    dispatch(bridge, &bytes, &mut sessions, &out_tx);
                }
                Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => return Err("relay sent a non-binary frame after registration".into()),
                Some(Err(error)) => return Err(error.to_string()),
            },
        }
    }
    for sender in sessions.values() {
        let _ = sender.send(Inbound::Closed);
    }
    Ok(())
}

async fn register(bridge: &Bridge, socket: &mut Socket) -> Result<()> {
    let challenge = next_text(socket).await?;
    let value: serde_json::Value =
        serde_json::from_str(&challenge).map_err(|error| error.to_string())?;
    if value["type"] != "challenge" {
        return Err("relay registration did not start with a challenge".into());
    }
    let nonce = encode::b64_decode(value["nonce"].as_str().unwrap_or_default())?;
    if nonce.len() != 32 {
        return Err("relay challenge nonce".into());
    }
    let identity = bridge.identity()?;
    let signature = identity.sign_registration(&nonce);
    let hello = serde_json::json!({
        "type": "hello",
        "protocol": 1,
        "key": encode::b64(&identity.registration_public()),
        "sig": encode::b64(&signature),
    });
    socket
        .send(Message::text(hello.to_string()))
        .await
        .map_err(|error| error.to_string())?;
    let ready = next_text(socket).await?;
    let value: serde_json::Value =
        serde_json::from_str(&ready).map_err(|error| error.to_string())?;
    if value["type"] != "ready" || value["runner"] != identity.runner_id {
        return Err("relay ready did not name this runner".into());
    }
    Ok(())
}

async fn next_text(socket: &mut Socket) -> Result<String> {
    let message = tokio::time::timeout(CONNECT_TIMEOUT, next_data(socket))
        .await
        .map_err(|_| "relay timed out".to_string())??;
    match message {
        Message::Text(text) => Ok(text.to_string()),
        Message::Close(_) => Err("relay closed".into()),
        _ => Err("relay registration frame was not text".into()),
    }
}

async fn next_data(socket: &mut Socket) -> Result<Message> {
    loop {
        match socket.next().await {
            Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
            Some(Ok(message)) => return Ok(message),
            Some(Err(error)) => return Err(error.to_string()),
            None => return Err("relay closed".into()),
        }
    }
}

fn dispatch(
    bridge: &Bridge,
    bytes: &[u8],
    sessions: &mut HashMap<u32, UnboundedSender<Inbound>>,
    outbound: &UnboundedSender<Vec<u8>>,
) {
    let Some(frame) = frames::decode(bytes) else {
        return;
    };
    match frame {
        RelayFrame::Open { channel } => {
            if let Some(previous) = sessions.remove(&channel) {
                let _ = previous.send(Inbound::Closed);
            }
            let (tx, rx) = unbounded_channel();
            sessions.insert(channel, tx.clone());
            let bridge = bridge.clone();
            let outbound = outbound.clone();
            tokio::spawn(async move { channel::run(bridge, channel, tx, rx, outbound).await });
        }
        RelayFrame::Data { channel, payload } => {
            if let Some(sender) = sessions.get(&channel) {
                let _ = sender.send(Inbound::Data(payload));
            }
        }
        RelayFrame::Close { channel, code } => {
            tracing::debug!(channel, code, "relay closed a channel");
            if let Some(sender) = sessions.remove(&channel) {
                let _ = sender.send(Inbound::Closed);
            }
        }
    }
}

fn stopped(stop: &std::sync::atomic::AtomicBool) -> bool {
    stop.load(std::sync::atomic::Ordering::Acquire)
}

async fn wait_stop(stop: &std::sync::atomic::AtomicBool) {
    while !stopped(stop) {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
