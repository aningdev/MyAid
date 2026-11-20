//! Bridge's own credential for the loopback dsh web, and the HTTP/1 client both forwarding
//! paths use.
//!
//! dsh web hands a Cookie to `GET /connect?token=…`; every later Remote call and the mux
//! websocket must present it. The login URL stays in memory and never reaches a log line —
//! and Bridge never forwards a Device's Cookie; it always sends this one.

use super::Bridge;
use crate::Result;
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::{
    Request, Uri,
    client::conn::http1,
    header::{self, HeaderValue},
};
use hyper_util::rt::TokioIo;
use std::{sync::Arc, time::Duration};
use tokio::net::TcpStream;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Where the local dsh web is, and which run of it this is.
#[derive(Clone, Debug)]
pub struct DshEndpoint {
    /// `http://127.0.0.1:<port>`, no trailing slash.
    pub origin: String,
    /// The login URL dsh wrote to stdout, including its token. Never logged.
    pub login: String,
    /// Changes whenever dsh restarts, so a stale Cookie is never reused.
    pub generation: String,
}

impl DshEndpoint {
    pub(super) fn authority(&self) -> Result<String> {
        let url = url::Url::parse(&self.origin)
            .map_err(|error| format!("dsh origin is not a URL: {error}"))?;
        let host = url.host_str().ok_or("dsh origin has no host")?;
        let host = if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]")
        } else {
            host.to_string()
        };
        match url.port() {
            Some(port) => Ok(format!("{host}:{port}")),
            None => Err("dsh origin has no port".into()),
        }
    }

    /// Origin-form URI for the HTTP client connection.
    pub(super) fn http_uri(&self, target: &str) -> Result<Uri> {
        target
            .parse()
            .map_err(|error| format!("dsh request target is not a URI: {error}"))
    }

    /// Absolute `ws://` URI for the websocket handshake.
    pub(super) fn ws_uri(&self, target: &str) -> Result<Uri> {
        format!("ws://{}{}", self.authority()?, target)
            .parse()
            .map_err(|error| format!("dsh websocket target is not a URI: {error}"))
    }
}

/// Supplies the current dsh endpoint, or `None` while dsh web is not ready.
pub type DshSource = Arc<dyn Fn() -> Option<DshEndpoint> + Send + Sync>;

pub(super) struct Cached {
    origin: String,
    generation: String,
    cookie: String,
}

impl Bridge {
    pub(super) fn dsh_endpoint(&self) -> Result<DshEndpoint> {
        (self.shared.dsh)().ok_or_else(|| "dsh web is not ready".to_string())
    }

    /// The Cookie for `endpoint`, exchanged once per dsh run.
    pub(super) async fn dsh_cookie(&self, endpoint: &DshEndpoint) -> Result<String> {
        if let Some(cookie) = cached(&self.shared.cookie, endpoint) {
            return Ok(cookie);
        }
        let cookie = exchange(endpoint).await?;
        *super::lock(&self.shared.cookie) = Some(Cached {
            origin: endpoint.origin.clone(),
            generation: endpoint.generation.clone(),
            cookie: cookie.clone(),
        });
        Ok(cookie)
    }

    /// A 401 means the Cookie died under us; the next request exchanges a new one.
    pub(super) fn invalidate_cookie(&self, endpoint: &DshEndpoint) {
        let mut slot = super::lock(&self.shared.cookie);
        if slot.as_ref().is_some_and(|cached| {
            cached.origin == endpoint.origin && cached.generation == endpoint.generation
        }) {
            *slot = None;
        }
    }
}

fn cached(slot: &std::sync::Mutex<Option<Cached>>, endpoint: &DshEndpoint) -> Option<String> {
    let slot = super::lock(slot);
    slot.as_ref()
        .filter(|cached| {
            cached.origin == endpoint.origin && cached.generation == endpoint.generation
        })
        .map(|cached| cached.cookie.clone())
}

/// The login URL on the loopback: dsh answers 302 or 303 with a `Set-Cookie`; Bridge keeps only the
/// cookie pairs and drops the redirect.
async fn exchange(endpoint: &DshEndpoint) -> Result<String> {
    let login =
        url::Url::parse(&endpoint.login).map_err(|_| "dsh login URL is not a URL".to_string())?;
    let target = match login.query() {
        Some(query) => format!("{}?{query}", login.path()),
        None => login.path().to_string(),
    };
    let (mut sender, connection) = connect(endpoint).await?;
    let request = Request::builder()
        .method("GET")
        .uri(endpoint.http_uri(&target)?)
        .header(header::HOST, endpoint.authority()?)
        .body(
            Full::new(Bytes::new())
                .map_err(|never| match never {})
                .boxed(),
        )
        .map_err(|error| format!("dsh connect request: {error}"))?;
    let response = sender
        .send_request(request)
        .await
        .map_err(|_| "dsh connect failed".to_string())?;
    connection.abort();
    // dsh answers `/connect` with 302 and the token-carrying root with 303, so any redirect or
    // success counts as long as a Cookie came back.
    if !response.status().is_redirection() && !response.status().is_success() {
        return Err(format!("dsh connect answered {}", response.status()));
    }
    let mut pairs = Vec::new();
    for value in response.headers().get_all(header::SET_COOKIE) {
        let Ok(text) = value.to_str() else { continue };
        let pair = text.split(';').next().unwrap_or("").trim();
        if !pair.is_empty() && pair.contains('=') && !pair.contains(['\r', '\n']) {
            pairs.push(pair.to_string());
        }
    }
    if pairs.is_empty() {
        return Err("dsh connect set no Cookie".into());
    }
    Ok(pairs.join("; "))
}

/// One HTTP/1 connection to the loopback. The returned task drives it and must outlive the
/// request.
pub(super) async fn connect(
    endpoint: &DshEndpoint,
) -> Result<(
    http1::SendRequest<http_body_util::combinators::BoxBody<bytes::Bytes, std::io::Error>>,
    tokio::task::JoinHandle<()>,
)> {
    let authority = endpoint.authority()?;
    let stream = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(&authority))
        .await
        .map_err(|_| "dsh web connect timed out".to_string())?
        .map_err(|error| format!("dsh web connect: {error}"))?;
    let _ = stream.set_nodelay(true);
    let (sender, connection) = http1::handshake::<
        _,
        http_body_util::combinators::BoxBody<bytes::Bytes, std::io::Error>,
    >(TokioIo::new(stream))
    .await
    .map_err(|error| format!("dsh web handshake: {error}"))?;
    Ok((
        sender,
        tokio::spawn(async move {
            let _ = connection.await;
        }),
    ))
}

/// The authority a websocket request to `endpoint` must carry.
pub(super) fn host_header(endpoint: &DshEndpoint) -> Result<HeaderValue> {
    HeaderValue::from_str(&endpoint.authority()?)
        .map_err(|error| format!("dsh host header: {error}"))
}
