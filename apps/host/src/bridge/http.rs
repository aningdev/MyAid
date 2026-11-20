//! One HTTP stream: a Device's `POST /api/…` forwarded to the loopback dsh web, its request
//! body streamed in, its response streamed back.
//!
//! The Device's Cookie and credentials never travel; Bridge sends its own loopback Cookie. An
//! unexpected 401 re-exchanges that Cookie once and replays a request body it still holds.

use super::{
    Bridge,
    channel::{Sink, Up},
    dsh::{self, DshEndpoint},
    frames::{BODY, END, HTTP_RESPONSE, MAX_FRAME_BODY, RESET},
};
use bytes::Bytes;
use futures_util::stream::unfold;
use http_body_util::{BodyExt, StreamBody, combinators::BoxBody};
use hyper::{
    Request, StatusCode,
    body::Frame,
    header::{self, HeaderName, HeaderValue},
};
use serde::Deserialize;
use std::{
    collections::VecDeque,
    io,
    sync::{Arc, Mutex, MutexGuard},
};
use tokio::sync::mpsc::UnboundedReceiver;

/// A request body up to this size is kept so a 401 can be retried; larger ones stream once.
const MAX_REPLAY: usize = 1024 * 1024;

/// Request headers Bridge never forwards: its own credential, the Device's, and hop-by-hop
/// fields. `Host` and `Content-Length` are rebuilt for the loopback connection.
const DROPPED: &[&str] = &[
    "authorization",
    "connection",
    "content-length",
    "cookie",
    "host",
    "keep-alive",
    "origin",
    "proxy-connection",
    "sec-websocket-extensions",
    "sec-websocket-key",
    "sec-websocket-protocol",
    "sec-websocket-version",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
];

#[derive(Deserialize)]
struct Head {
    method: String,
    path: String,
    #[serde(default)]
    headers: Vec<(String, String)>,
}

enum Failure {
    Protocol,
    Forbidden,
    Unavailable,
}

impl Failure {
    fn code(&self) -> &'static str {
        match self {
            Self::Protocol => "protocol",
            Self::Forbidden => "forbidden",
            Self::Unavailable => "unavailable",
        }
    }
}

pub(super) async fn run(bridge: Bridge, head: Vec<u8>, up: UnboundedReceiver<Up>, down: Sink) {
    if let Err(failure) = forward(&bridge, &head, up, &down).await {
        tracing::debug!(
            channel = down.channel(),
            stream = down.stream(),
            code = failure.code(),
            "bridge http stream"
        );
        down.reset(failure.code());
    }
    down.done();
}

async fn forward(
    bridge: &Bridge,
    head: &[u8],
    up: UnboundedReceiver<Up>,
    down: &Sink,
) -> Result<(), Failure> {
    let head: Head = serde_json::from_slice(head).map_err(|_| Failure::Protocol)?;
    if head.method != "POST" {
        return Err(Failure::Forbidden);
    }
    if !allowed_path(&head.path) {
        return Err(Failure::Forbidden);
    }
    let endpoint = bridge.dsh_endpoint().map_err(|_| Failure::Unavailable)?;
    let mut cookie = bridge.dsh_cookie(&endpoint).await.map_err(|error| {
        tracing::debug!(%error, "bridge dsh cookie");
        Failure::Unavailable
    })?;
    let headers = forwarded_headers(&head.headers)?;

    let up = Arc::new(tokio::sync::Mutex::new(up));
    let mut retry: Option<VecDeque<Bytes>> = None;
    for attempt in 0..2 {
        let replay = Arc::new(Mutex::new(Replay::default()));
        let prefix = retry.take().unwrap_or_default();
        let prefix_only = attempt > 0;
        let body = body_stream(Body {
            prefix,
            prefix_only,
            rx: up.clone(),
            replay: replay.clone(),
        });
        let (mut sender, connection) = dsh::connect(&endpoint).await.map_err(|error| {
            tracing::debug!(%error, "bridge dsh connect");
            Failure::Unavailable
        })?;
        let request = build_request(&endpoint, &head.path, &cookie, &headers, body)?;
        let response = sender.send_request(request).await.map_err(|error| {
            tracing::debug!(%error, "bridge dsh request");
            Failure::Unavailable
        })?;
        if response.status() == StatusCode::UNAUTHORIZED && attempt == 0 {
            connection.abort();
            let (finished, replayable) = {
                let replay = lock(&replay);
                let finished = replay.ended;
                let replayable = !replay.overflow;
                (finished, replayable)
            };
            // A body that already streamed past the replay buffer cannot be retried, and dsh
            // said the Cookie is stale: the stream fails as unavailable rather than forbidden.
            if !finished || !replayable {
                return Err(Failure::Unavailable);
            }
            retry = Some(lock(&replay).chunks.clone().into());
            bridge.invalidate_cookie(&endpoint);
            cookie = bridge
                .dsh_cookie(&endpoint)
                .await
                .map_err(|_| Failure::Unavailable)?;
            continue;
        }
        if response.status() == StatusCode::UNAUTHORIZED {
            // The second 401 after a fresh Cookie is a dsh web that will not take this token.
            connection.abort();
            return Err(Failure::Unavailable);
        }
        let status = response.status().as_u16();
        let headers = response_headers(&response);
        down.frame(
            HTTP_RESPONSE,
            serde_json::to_vec(&serde_json::json!({
                "status": status,
                "headers": headers,
            }))
            .map_err(|_| Failure::Protocol)?,
        );
        let mut body = response.into_body();
        while let Some(frame) = body.frame().await {
            let frame = frame.map_err(|error| {
                tracing::debug!(%error, "bridge dsh response");
                Failure::Unavailable
            })?;
            let Some(data) = frame.data_ref() else {
                continue;
            };
            for chunk in data.chunks(MAX_FRAME_BODY) {
                down.frame(BODY, chunk.to_vec());
            }
        }
        down.frame(END, Vec::new());
        connection.abort();
        return Ok(());
    }
    Err(Failure::Unavailable)
}

fn allowed_path(path: &str) -> bool {
    path.starts_with("/api/")
        && !path[1..].starts_with('/')
        && !path.contains('#')
        && !path.chars().any(char::is_control)
}

fn forwarded_headers(
    headers: &[(String, String)],
) -> Result<Vec<(HeaderName, HeaderValue)>, Failure> {
    let mut forwarded = Vec::with_capacity(headers.len());
    for (name, value) in headers {
        let name = HeaderName::from_bytes(name.as_bytes()).map_err(|_| Failure::Protocol)?;
        if DROPPED.contains(&name.as_str()) {
            continue;
        }
        let value = HeaderValue::from_str(value).map_err(|_| Failure::Protocol)?;
        forwarded.push((name, value));
    }
    Ok(forwarded)
}

fn build_request(
    endpoint: &DshEndpoint,
    path: &str,
    cookie: &str,
    headers: &[(HeaderName, HeaderValue)],
    body: BoxBody<Bytes, io::Error>,
) -> Result<Request<BoxBody<Bytes, io::Error>>, Failure> {
    let uri = endpoint.http_uri(path).map_err(|_| Failure::Protocol)?;
    let mut request = Request::builder()
        .method("POST")
        .uri(uri)
        .header(
            header::HOST,
            dsh::host_header(endpoint).map_err(|_| Failure::Protocol)?,
        )
        .header(header::COOKIE, cookie)
        .body(body)
        .map_err(|_| Failure::Protocol)?;
    for (name, value) in headers {
        request.headers_mut().append(name.clone(), value.clone());
    }
    Ok(request)
}

fn response_headers(response: &hyper::Response<hyper::body::Incoming>) -> Vec<(String, String)> {
    let mut headers = Vec::new();
    for (name, value) in response.headers() {
        if matches!(
            name.as_str(),
            "set-cookie"
                | "connection"
                | "keep-alive"
                | "proxy-connection"
                | "te"
                | "trailer"
                | "transfer-encoding"
                | "upgrade"
        ) {
            continue;
        }
        headers.push((
            name.as_str().to_string(),
            String::from_utf8_lossy(value.as_bytes()).into_owned(),
        ));
    }
    headers
}

#[derive(Default)]
struct Replay {
    chunks: Vec<Bytes>,
    total: usize,
    ended: bool,
    overflow: bool,
}

struct Body {
    prefix: VecDeque<Bytes>,
    prefix_only: bool,
    rx: Arc<tokio::sync::Mutex<UnboundedReceiver<Up>>>,
    replay: Arc<Mutex<Replay>>,
}

fn body_stream(body: Body) -> BoxBody<Bytes, io::Error> {
    let stream = unfold(body, |mut body| async move {
        if let Some(chunk) = body.prefix.pop_front() {
            return Some((Ok(Frame::data(chunk)), body));
        }
        if body.prefix_only {
            return None;
        }
        loop {
            let next = {
                let mut rx = body.rx.lock().await;
                rx.recv().await
            };
            match next {
                Some(Up::Frame {
                    kind: BODY,
                    body: data,
                }) => {
                    if data.is_empty() {
                        continue;
                    }
                    let chunk = Bytes::from(data);
                    {
                        let mut replay = lock(&body.replay);
                        if !replay.overflow {
                            if replay.total + chunk.len() > MAX_REPLAY {
                                replay.overflow = true;
                                replay.chunks.clear();
                                replay.total = 0;
                            } else {
                                replay.total += chunk.len();
                                replay.chunks.push(chunk.clone());
                            }
                        }
                    }
                    return Some((Ok(Frame::data(chunk)), body));
                }
                Some(Up::Frame { kind: END, .. }) => {
                    lock(&body.replay).ended = true;
                    return None;
                }
                Some(Up::Frame { kind: RESET, .. }) => {
                    return Some((
                        Err(io::Error::new(
                            io::ErrorKind::ConnectionAborted,
                            "device reset",
                        )),
                        body,
                    ));
                }
                Some(Up::Frame { .. }) => continue,
                Some(Up::Closed) | None => {
                    return Some((
                        Err(io::Error::new(io::ErrorKind::BrokenPipe, "stream closed")),
                        body,
                    ));
                }
            }
        }
    });
    StreamBody::new(stream).boxed()
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
