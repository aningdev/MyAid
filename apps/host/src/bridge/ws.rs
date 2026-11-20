//! One websocket stream: a Device's `/api/remote.mux` forwarded to the loopback dsh web.
//!
//! dsh pings its mux sockets and drops one after two missed pongs. Bridge keeps polling the
//! loopback socket, so the reply happens here and a Device that never answers a ping still
//! sees a live mux. Message fragments are reassembled on the way in and chunked on the way
//! out; a broken stream closes the loopback socket it owns.

use super::{
    Bridge,
    channel::{Sink, Up},
    dsh,
    frames::{MAX_FRAME_BODY, RESET, WS_ACCEPT, WS_BINARY, WS_CLOSE, WS_TEXT},
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{
        Message,
        protocol::{CloseFrame, frame::coding::CloseCode},
    },
};

/// The only path a Device may open as a websocket.
const MUX: &str = "/api/remote.mux";

/// A single reassembled message may not grow past this; the contract resets the stream.
const MAX_MESSAGE: usize = 8 * 1024 * 1024;

#[derive(Deserialize)]
struct Open {
    path: String,
    #[serde(default)]
    protocols: Vec<String>,
}

#[derive(Serialize)]
struct Accept {
    protocol: Option<String>,
}

#[derive(Deserialize)]
struct Close {
    code: u16,
    reason: String,
}

#[derive(Serialize)]
struct Closed<'a> {
    code: u16,
    reason: &'a str,
}

enum Event {
    Dsh(Option<Result<Message, tokio_tungstenite::tungstenite::Error>>),
    Device(Option<Up>),
}

pub(super) async fn run(
    bridge: Bridge,
    stream: u32,
    head: Vec<u8>,
    mut up: UnboundedReceiver<Up>,
    down: Sink,
) {
    if let Err(code) = forward(&bridge, stream, &head, &mut up, &down).await {
        down.reset(code);
    }
    down.done();
}

async fn forward(
    bridge: &Bridge,
    stream: u32,
    head: &[u8],
    up: &mut UnboundedReceiver<Up>,
    down: &Sink,
) -> Result<(), &'static str> {
    let open: Open = serde_json::from_slice(head).map_err(|_| "protocol")?;
    if open.path != MUX {
        return Err("forbidden");
    }
    let endpoint = bridge.dsh_endpoint().map_err(|_| "unavailable")?;
    let cookie = bridge
        .dsh_cookie(&endpoint)
        .await
        .map_err(|_| "unavailable")?;
    let uri = endpoint.ws_uri(MUX).map_err(|_| "unavailable")?;
    let mut request = uri.into_client_request().map_err(|_| "unavailable")?;
    {
        let headers = request.headers_mut();
        headers.insert(
            tokio_tungstenite::tungstenite::http::header::HOST,
            dsh::host_header(&endpoint).map_err(|_| "unavailable")?,
        );
        headers.insert(
            tokio_tungstenite::tungstenite::http::header::COOKIE,
            cookie.parse().map_err(|_| "unavailable")?,
        );
        if !open.protocols.is_empty() {
            // dsh hands the first requested protocol back, so the Device's offer is carried
            // through unchanged and its accept arrives as-is in WS_ACCEPT.
            let offered = open.protocols.join(", ");
            headers.insert(
                tokio_tungstenite::tungstenite::http::header::SEC_WEBSOCKET_PROTOCOL,
                offered.parse().map_err(|_| "protocol")?,
            );
        }
    }
    let (mut socket, response) = connect_async(request).await.map_err(|error| {
        tracing::debug!(channel = down.channel(), stream, %error, "bridge dsh mux");
        "unavailable"
    })?;
    let protocol = response
        .headers()
        .get(tokio_tungstenite::tungstenite::http::header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    down.frame(
        WS_ACCEPT,
        serde_json::to_vec(&Accept { protocol }).map_err(|_| "protocol")?,
    );

    let mut pending: Option<(u8, Vec<u8>)> = None;
    loop {
        let event = {
            tokio::select! {
                message = socket.next() => Event::Dsh(message),
                frame = up.recv() => Event::Device(frame),
            }
        };
        match event {
            Event::Dsh(Some(Ok(Message::Text(text)))) => texts(down, text.as_str()),
            Event::Dsh(Some(Ok(Message::Binary(data)))) => binaries(down, &data),
            Event::Dsh(Some(Ok(Message::Close(frame)))) => {
                let (code, reason) = match frame {
                    Some(frame) => (u16::from(frame.code), frame.reason.to_string()),
                    None => (1000, String::new()),
                };
                down.frame(
                    WS_CLOSE,
                    serde_json::to_vec(&Closed {
                        code,
                        reason: &reason,
                    })
                    .map_err(|_| "protocol")?,
                );
                break;
            }
            Event::Dsh(Some(Ok(_))) => continue,
            Event::Dsh(Some(Err(_)) | None) => return Err("unavailable"),
            Event::Device(Some(Up::Frame { kind, body }))
                if kind == WS_TEXT || kind == WS_BINARY =>
            {
                let Some(fin) = body.first().copied() else {
                    return Err("protocol");
                };
                let fragment = &body[1..];
                let assembled = match pending.take() {
                    Some((open, mut data)) if open == kind => {
                        data.extend_from_slice(fragment);
                        data
                    }
                    Some(_) => return Err("protocol"),
                    None => fragment.to_vec(),
                };
                if assembled.len() > MAX_MESSAGE {
                    return Err("overloaded");
                }
                if fin == 0 {
                    pending = Some((kind, assembled));
                    continue;
                }
                if kind == WS_TEXT {
                    let text = String::from_utf8(assembled).map_err(|_| "protocol")?;
                    socket
                        .send(Message::text(text))
                        .await
                        .map_err(|_| "unavailable")?;
                } else {
                    socket
                        .send(Message::binary(assembled))
                        .await
                        .map_err(|_| "unavailable")?;
                }
            }
            Event::Device(Some(Up::Frame {
                kind: WS_CLOSE,
                body,
            })) => {
                let close: Close = serde_json::from_slice(&body).map_err(|_| "protocol")?;
                let reason = close.reason;
                let frame = CloseFrame {
                    code: close_code(close.code),
                    reason: reason.into(),
                };
                let _ = socket.send(Message::Close(Some(frame))).await;
                break;
            }
            Event::Device(Some(Up::Frame { kind: RESET, .. })) => break,
            Event::Device(Some(Up::Frame { .. })) => continue,
            Event::Device(Some(Up::Closed) | None) => break,
        }
    }
    let _ = socket.close(None).await;
    Ok(())
}

/// Sends one text message to the Device in frames that respect UTF-8 boundaries.
fn texts(down: &Sink, text: &str) {
    let mut start = 0;
    let mut chunks = Vec::new();
    while start < text.len() {
        let mut end = (start + MAX_FRAME_BODY).min(text.len());
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        chunks.push((false, &text[start..end]));
        start = end;
    }
    if chunks.is_empty() {
        chunks.push((true, ""));
    }
    if let Some(last) = chunks.last_mut() {
        last.0 = true;
    }
    for (fin, chunk) in chunks {
        let mut body = Vec::with_capacity(chunk.len() + 1);
        body.push(u8::from(fin));
        body.extend_from_slice(chunk.as_bytes());
        down.frame(WS_TEXT, body);
    }
}

fn binaries(down: &Sink, data: &[u8]) {
    let mut start = 0;
    loop {
        let end = (start + MAX_FRAME_BODY).min(data.len());
        let fin = end == data.len();
        let mut body = Vec::with_capacity(end - start + 1);
        body.push(u8::from(fin));
        body.extend_from_slice(&data[start..end]);
        down.frame(WS_BINARY, body);
        start = end;
        if fin {
            break;
        }
    }
}

fn close_code(code: u16) -> CloseCode {
    let code = CloseCode::from(code);
    if code.is_allowed() {
        code
    } else {
        CloseCode::Normal
    }
}
