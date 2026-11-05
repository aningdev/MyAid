//! Bounded WebSocket I/O owned and disposed by one JS Socket instance.
//! Cookie handshake for NSH 0.4 (standard websocket.connect still rejects Cookie headers).
use futures_util::{SinkExt, StreamExt};
use nsh_core::prelude::*;
use std::{sync::Arc, time::Duration};
use tokio::sync::{Mutex, mpsc};
use tokio_tungstenite::tungstenite::{Message, client::IntoClientRequest, http::HeaderValue};

/// A socket owned by the JS instance; disposal aborts its network task.
#[class]
pub struct Socket {
    send: mpsc::Sender<Option<String>>,
    incoming: Arc<Mutex<mpsc::Receiver<Result<String, String>>>>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for Socket {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Only `ws://127.0.0.1/api/remote.mux` with no userinfo/query/fragment.
pub(super) fn validate_mux_url(url: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(url).map_err(|_| "Invalid socket URL")?;
    if parsed.scheme() != "ws"
        || parsed.host_str() != Some("127.0.0.1")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
        || parsed.query().is_some()
        || parsed.path() != "/api/remote.mux"
    {
        return Err("Only the local API socket is supported".into());
    }
    Ok(parsed)
}

/// Opens only an authenticated local API socket, with a bounded handshake.
pub(super) async fn connect(url: String, cookie: String) -> Result<Socket, String> {
    let _ = validate_mux_url(&url)?;
    let mut request = url.into_client_request().map_err(|_| "Invalid handshake")?;
    request.headers_mut().insert(
        "cookie",
        HeaderValue::from_str(&cookie).map_err(|_| "Invalid cookie")?,
    );
    let (socket, _) = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::connect_async(request),
    )
    .await
    .map_err(|_| "Socket handshake timed out")?
    .map_err(|_| "Socket handshake failed")?;
    let (mut writer, mut reader) = socket.split();
    let (send, mut outgoing) = mpsc::channel::<Option<String>>(16);
    let (received, incoming) = mpsc::channel(32);
    let task = background(async move {
        loop {
            tokio::select! {
                command = outgoing.recv() => {
                    match command {
                        Some(Some(text)) => {
                            if writer.send(Message::Text(text.into())).await.is_err() { break; }
                        }
                        _ => { let _ = writer.close().await; break; }
                    }
                }
                message = reader.next() => {
                    match message {
                        Some(Ok(Message::Text(text))) => {
                            if received.try_send(Ok(text.to_string())).is_err() { break; }
                        }
                        Some(Ok(Message::Ping(bytes))) => {
                            if writer.send(Message::Pong(bytes)).await.is_err() { break; }
                        }
                        Some(Ok(Message::Close(_))) | None => break,
                        Some(Err(_)) => { let _ = received.try_send(Err("Socket read failed".into())); break; }
                        _ => {}
                    }
                }
            }
        }
    });
    Ok(Socket {
        send,
        incoming: Arc::new(Mutex::new(incoming)),
        task,
    })
}

#[class]
impl Socket {
    /// Queues text with a bounded backlog; no replay after failure.
    pub fn write(&self, text: String) -> Result<(), String> {
        if text.len() > 8 * 1024 * 1024 {
            return Err("Socket message too large".into());
        }
        self.send
            .try_send(Some(text))
            .map_err(|_| "Socket closed or write queue full".into())
    }

    /// Reads the next text message. Only one consumer should read a socket.
    pub fn read(&self) -> Later<String> {
        let incoming = self.incoming.clone();
        Later::new(async move {
            incoming
                .lock()
                .await
                .recv()
                .await
                .unwrap_or_else(|| Err("Socket closed".into()))
        })
    }

    /// Requests orderly shutdown; disposal always aborts remaining I/O.
    pub fn close(&self) {
        if self.send.try_send(None).is_err() {
            self.task.abort();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::validate_mux_url;

    #[test]
    fn accepts_local_mux() {
        assert!(validate_mux_url("ws://127.0.0.1:9/api/remote.mux").is_ok());
    }

    #[test]
    fn rejects_cookie_query_and_non_loopback() {
        assert!(validate_mux_url("ws://127.0.0.1/api/remote.mux?x=1").is_err());
        assert!(validate_mux_url("ws://example.com/api/remote.mux").is_err());
        assert!(validate_mux_url("wss://127.0.0.1/api/remote.mux").is_err());
    }
}
