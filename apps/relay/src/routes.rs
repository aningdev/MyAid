//! Routes and peer check for the Relay's local control API.
//!
//! `/` and `/v1/health` are liveness and version facts. The registration routes take the data
//! root's token, and refuse a request that carries an `Origin` or names another host, as the
//! Host's API does.

use crate::{Config, service::Registration};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use myaid_service::RegistrationSnapshot;
use std::{sync::Arc, time::Instant};
use subtle::ConstantTimeEq;

/// The forwarding protocol this build speaks; the Host's control API is separate.
pub const PROTOCOL: u32 = 1;

#[derive(Clone)]
pub struct Api {
    pub config: Config,
    pub registration: Registration,
    /// The port this process bound, which every control caller's `Host` must name.
    pub port: u16,
    pub token: Arc<str>,
    pub started: Instant,
}

pub fn router(api: Api) -> Router {
    let guarded = Router::new()
        .route("/registration", get(registration_snapshot))
        .route("/registration/enable", post(registration_enable))
        .route("/registration/stop", post(registration_stop))
        .layer(middleware::from_fn_with_state(api.clone(), authorize));
    Router::new()
        .route("/", get(index))
        .route("/v1/health", get(health))
        .merge(guarded)
        .with_state(api)
}

async fn index() -> &'static str {
    "myaid-relay"
}

/// What a release, a deploy probe, and the Client's panel read without a token.
async fn health(State(api): State<Api>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "service": "myaid-relay",
        "version": api.config.version,
        "protocol": PROTOCOL,
        "uptimeMs": api.started.elapsed().as_millis() as u64,
    }))
}

async fn authorize(
    State(api): State<Api>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    if let Err(reason) = check_caller(&headers, api.port) {
        tracing::debug!(path = %request.uri().path(), "refused a request: {reason}");
        return StatusCode::FORBIDDEN.into_response();
    }
    if !check_token(&headers, &api.token) {
        tracing::warn!("refused a control request without this data root's token");
        return StatusCode::UNAUTHORIZED.into_response();
    }
    next.run(request).await
}

/// What a browser's request carries and a local client's does not.
pub fn check_caller(headers: &HeaderMap, port: u16) -> std::result::Result<(), &'static str> {
    if headers.contains_key(header::ORIGIN) {
        return Err("it has an Origin, as a web page's does");
    }
    let host = headers
        .get(header::HOST)
        .and_then(|host| host.to_str().ok())
        .unwrap_or_default();
    if ![
        format!("127.0.0.1:{port}"),
        format!("localhost:{port}"),
    ]
    .iter()
    .any(|local| host.eq_ignore_ascii_case(local))
    {
        return Err("its Host is not this port on loopback");
    }
    Ok(())
}

pub fn check_token(headers: &HeaderMap, token: &str) -> bool {
    let sent = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default();
    // An empty token is never a match: a data root with no token takes no client.
    !token.is_empty() && sent.as_bytes().ct_eq(token.as_bytes()).into()
}

async fn registration_snapshot(State(api): State<Api>) -> Json<RegistrationSnapshot> {
    Json(api.registration.snapshot())
}

async fn registration_enable(State(api): State<Api>) -> Response {
    let registration = api.registration.clone();
    match tokio::task::spawn_blocking(move || registration.enable()).await {
        Ok(Ok(unit)) => Json(unit).into_response(),
        Ok(Err(error)) => failed(error),
        Err(error) => failed(error.to_string()),
    }
}

async fn registration_stop(State(api): State<Api>) -> Response {
    let registration = api.registration.clone();
    match tokio::task::spawn_blocking(move || registration.stop()).await {
        Ok(Ok(unit)) => Json(unit).into_response(),
        Ok(Err(error)) => failed(error),
        Err(error) => failed(error.to_string()),
    }
}

fn failed(error: String) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": error })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(host: &str, origin: Option<&str>, bearer: Option<&str>) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, host.parse().unwrap());
        if let Some(origin) = origin {
            headers.insert(header::ORIGIN, origin.parse().unwrap());
        }
        if let Some(bearer) = bearer {
            headers.insert(
                header::AUTHORIZATION,
                format!("Bearer {bearer}").parse().unwrap(),
            );
        }
        headers
    }

    #[test]
    fn a_page_or_another_host_is_refused() {
        assert!(check_caller(&headers("127.0.0.1:8787", None, None), 8787).is_ok());
        assert!(check_caller(&headers("localhost:8787", None, None), 8787).is_ok());
        assert!(check_caller(&headers("127.0.0.1:1", None, None), 8787).is_err());
        assert!(
            check_caller(&headers("127.0.0.1:8787", Some("https://x.test"), None), 8787).is_err()
        );
    }

    #[test]
    fn only_the_exact_token_is_accepted() {
        assert!(check_token(&headers("127.0.0.1:8787", None, Some("t")), "t"));
        assert!(!check_token(&headers("127.0.0.1:8787", None, Some("t2")), "t"));
        assert!(!check_token(&headers("127.0.0.1:8787", None, None), "t"));
    }
}
