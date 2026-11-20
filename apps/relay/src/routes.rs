//! Routes for the public relay: liveness, health, and the two WebSocket endpoints.

use crate::{
    Config, device,
    limits::Limits,
    rate::RateLimiter,
    runner::{self, Registry},
    tap::Tap,
};
use axum::{
    Json, Router,
    extract::{
        ConnectInfo, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    http::HeaderMap,
    response::Response,
    routing::get,
};
use std::{
    collections::HashSet,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::Instant,
};

/// The relay protocol version this build speaks.
pub const PROTOCOL: u32 = 1;

/// Bytes a WebSocket frame may carry before the transport drops it. Our own
/// limits are tighter; this only bounds what a single frame can buffer.
const TRANSPORT_FRAMES: usize = 4;

#[derive(Clone)]
pub struct Api {
    pub config: Config,
    pub started: Instant,
    pub registry: Arc<Registry>,
    pub rate: Arc<RateLimiter>,
    pub limits: Limits,
    pub tap: Tap,
}

pub fn router(api: Api) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/v1/health", get(health))
        .route("/v1/runner", get(runner))
        .route("/v1/device", get(device_connection))
        .with_state(api)
}

async fn index() -> &'static str {
    "dsh-bot-relay"
}

/// What a release and a deploy probe read.
async fn health(State(api): State<Api>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "service": "dsh-bot-relay",
        "version": api.config.version,
        "protocol": PROTOCOL,
        "uptimeMs": api.started.elapsed().as_millis() as u64,
    }))
}

async fn runner(upgrade: WebSocketUpgrade, State(api): State<Api>) -> Response {
    accept(upgrade, api.limits.max_message, move |socket: WebSocket| {
        runner::serve_connection(socket, api.registry.clone(), api.limits, api.tap.clone())
    })
}

async fn device_connection(
    upgrade: WebSocketUpgrade,
    State(api): State<Api>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<DeviceQuery>,
) -> Response {
    let client = client_ip(peer.ip(), &api.config.trusted_proxies, &headers);
    let limits = api.limits;
    accept(upgrade, limits.max_message, move |socket: WebSocket| {
        device::serve_connection(
            socket,
            query.runner,
            client,
            api.rate.clone(),
            api.registry.clone(),
            limits,
            api.tap.clone(),
        )
    })
}

#[derive(serde::Deserialize)]
struct DeviceQuery {
    runner: Option<String>,
}

/// Client IP for the device rate limit and logs.
///
/// An untrusted peer is itself: its `X-Forwarded-For` is ignored. A trusted
/// peer contributes the rightmost entry of the last header value, the address
/// the proxy itself observed; every entry left of it came from the client and
/// could be forged. No header, a value that is not text, or a rightmost entry
/// that is not a bare IP keeps `peer`.
fn client_ip(peer: IpAddr, trusted: &HashSet<IpAddr>, headers: &HeaderMap) -> IpAddr {
    if !trusted.contains(&peer) {
        return peer;
    }
    let Some(value) = headers.get_all("x-forwarded-for").iter().next_back() else {
        return peer;
    };
    let Ok(text) = value.to_str() else {
        return peer;
    };
    text.rsplit(',')
        .next()
        .and_then(|entry| entry.trim().parse().ok())
        .unwrap_or(peer)
}

/// Accept the upgrade with the transport cap and hand the socket to `serve`.
fn accept<F, Fut>(upgrade: WebSocketUpgrade, max_message: usize, serve: F) -> Response
where
    F: FnOnce(WebSocket) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    upgrade
        .max_message_size(max_message.saturating_mul(TRANSPORT_FRAMES))
        .on_upgrade(serve)
}

#[cfg(test)]
mod tests {
    use super::client_ip;
    use std::{collections::HashSet, net::IpAddr};

    fn ip(text: &str) -> IpAddr {
        text.parse().expect("ip")
    }

    fn forwarded(values: &[&str]) -> axum::http::HeaderMap {
        let mut headers = axum::http::HeaderMap::new();
        for value in values {
            headers.append("x-forwarded-for", value.parse().expect("header"));
        }
        headers
    }

    fn trusted(peer: IpAddr) -> HashSet<IpAddr> {
        HashSet::from([peer])
    }

    #[test]
    fn the_last_forwarded_for_header_supplies_the_client() {
        let peer = ip("127.0.0.1");
        let headers = forwarded(&["203.0.113.1, 203.0.113.2", "198.51.100.7, 198.51.100.8"]);
        assert_eq!(
            client_ip(peer, &trusted(peer), &headers),
            ip("198.51.100.8")
        );
        // An unusable last header does not fall through to an earlier one.
        let headers = forwarded(&["203.0.113.5", "not-an-ip"]);
        assert_eq!(client_ip(peer, &trusted(peer), &headers), peer);
    }

    #[test]
    fn only_the_rightmost_entry_names_the_client() {
        let peer = ip("127.0.0.1");
        let headers = forwarded(&["  203.0.113.4 , nope ,  198.51.100.9 "]);
        assert_eq!(
            client_ip(peer, &trusted(peer), &headers),
            ip("198.51.100.9")
        );
        let headers = forwarded(&["203.0.113.4, 2001:db8::1"]);
        assert_eq!(client_ip(peer, &trusted(peer), &headers), ip("2001:db8::1"));
        // A forged entry left of an unusable rightmost one is never taken.
        let headers = forwarded(&["203.0.113.4, not-an-ip"]);
        assert_eq!(client_ip(peer, &trusted(peer), &headers), peer);
    }

    #[test]
    fn a_missing_or_useless_forwarded_for_keeps_the_peer() {
        let peer = ip("127.0.0.1");
        let trusted = trusted(peer);
        assert_eq!(
            client_ip(peer, &trusted, &axum::http::HeaderMap::new()),
            peer
        );
        assert_eq!(
            client_ip(peer, &trusted, &forwarded(&["not-an-ip, also-bad"])),
            peer
        );
        let mut raw = axum::http::HeaderMap::new();
        raw.append(
            "x-forwarded-for",
            axum::http::HeaderValue::from_bytes(&[0xff]).expect("obs-text"),
        );
        assert_eq!(client_ip(peer, &trusted, &raw), peer);
    }

    #[test]
    fn an_untrusted_peer_ignores_forwarded_for() {
        let peer = ip("127.0.0.1");
        let headers = forwarded(&["203.0.113.8, 203.0.113.9"]);
        assert_eq!(client_ip(peer, &HashSet::new(), &headers), peer);
        assert_eq!(
            client_ip(peer, &HashSet::from([ip("10.0.0.1")]), &headers),
            peer
        );
    }
}
