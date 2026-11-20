//! Liveness and health for the public relay. Pairing and forwarding are not here yet.

use crate::Config;
use axum::{Json, Router, extract::State, routing::get};
use std::time::Instant;

/// The forwarding protocol this build will speak. Nothing forwards on it yet.
pub const PROTOCOL: u32 = 1;

#[derive(Clone)]
pub struct Api {
    pub config: Config,
    pub started: Instant,
}

pub fn router(api: Api) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/v1/health", get(health))
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
