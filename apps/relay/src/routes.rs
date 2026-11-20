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
    response::Response,
    routing::get,
};
use std::{net::SocketAddr, sync::Arc, time::Instant};

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
    axum::extract::Query(query): axum::extract::Query<DeviceQuery>,
) -> Response {
    let limits = api.limits;
    accept(upgrade, limits.max_message, move |socket: WebSocket| {
        device::serve_connection(
            socket,
            query.runner,
            peer.ip(),
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
