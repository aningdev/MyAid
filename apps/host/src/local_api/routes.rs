//! Routes, peer check and request dispatch.

use super::{
    Status, assert_connection_info, assert_public_status,
    auth::{check_caller, check_token, matches},
};
use crate::{
    Result,
    bridge::{Bridge, IssueError},
    dsh_process::Lifecycle,
    service::{Registration, RegistrationSnapshot},
};
use axum::{
    Json, Router,
    extract::{
        Path, Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde::Deserialize;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

/// What every handler reads.
#[derive(Clone)]
pub struct Api {
    pub lifecycle: Lifecycle,
    pub registration: Registration,
    pub bridge: Bridge,
    /// The port this process bound, which every caller's `Host` must name.
    pub port: u16,
    pub token: Arc<str>,
    pub exit: Arc<AtomicBool>,
}

/// The API: `/` for a liveness probe, everything else behind [`authorize`].
pub fn router(api: Api) -> Router {
    let guarded = Router::new()
        .route("/status", get(status))
        .route("/connection", get(connection))
        .route("/watch", get(watch))
        .route("/dsh/start", post(start))
        .route("/dsh/stop", post(stop))
        .route("/dsh/restart", post(restart))
        .route("/registration", get(registration_snapshot))
        .route("/registration/enable", post(registration_enable))
        .route("/registration/stop", post(registration_stop))
        .route("/bridge/pairing", post(bridge_pairing))
        .route("/bridge/devices", get(bridge_devices))
        .route("/bridge/devices/{device_id}", delete(bridge_revoke))
        .layer(middleware::from_fn_with_state(api.clone(), authorize));
    Router::new()
        .route("/", get(index))
        .merge(guarded)
        .with_state(api)
}

async fn index() -> &'static str {
    "dsh-bot"
}

/// A refusal is the caller's, not the Host's: 403 for a page or another host, 401 for no token.
async fn authorize(
    State(api): State<Api>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    if let Err(reason) = check_caller(&headers, api.port) {
        // Debug: a page can send these as often as it likes.
        tracing::debug!(path = %request.uri().path(), "refused a request: {reason}");
        return StatusCode::FORBIDDEN.into_response();
    }
    if !check_token(&headers, &api.token) {
        tracing::warn!("refused a control request without this data root's token");
        return StatusCode::UNAUTHORIZED.into_response();
    }
    next.run(request).await
}

/// One failure, as JSON, so the Client can word it.
fn failed(error: String) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": error })),
    )
        .into_response()
}

/// The lifecycle is a blocking owner; the API never holds a request open on the runtime thread.
async fn blocking<T, F>(work: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T> + Send + 'static,
{
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
}

async fn status(State(api): State<Api>) -> Response {
    let snapshot = api.lifecycle.snapshot();
    match assert_public_status(&snapshot) {
        Ok(()) => Json(snapshot).into_response(),
        Err(error) => failed(error),
    }
}

async fn connection(State(api): State<Api>) -> Response {
    let lifecycle = api.lifecycle.clone();
    let result = blocking(move || {
        let info = lifecycle.connection_info()?;
        assert_connection_info(&info)?;
        assert_public_status(&info.public())?;
        Ok(info)
    })
    .await;
    match result {
        Ok(info) => Json(info).into_response(),
        Err(error) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": error })),
        )
            .into_response(),
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StartBody {
    /// `attach` (a client found the Host) or `userStart` (the user asked for it).
    source: Option<String>,
}

async fn start(State(api): State<Api>, body: Option<Json<StartBody>>) -> Response {
    let source = body.and_then(|Json(body)| body.source).unwrap_or_default();
    if !matches!(source.as_str(), "" | "attach" | "userStart") {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let explicit = source == "userStart";
    let lifecycle = api.lifecycle.clone();
    match blocking(move || lifecycle.ensure(explicit)).await {
        Ok(snapshot) => published(&snapshot),
        Err(error) => failed(error),
    }
}

async fn stop(State(api): State<Api>) -> Response {
    let lifecycle = api.lifecycle.clone();
    match blocking(move || lifecycle.stop()).await {
        Ok(snapshot) => published(&snapshot),
        Err(error) => failed(error),
    }
}

async fn restart(State(api): State<Api>) -> Response {
    let lifecycle = api.lifecycle.clone();
    match blocking(move || lifecycle.restart()).await {
        Ok(snapshot) => published(&snapshot),
        Err(error) => failed(error),
    }
}

fn published(status: &Status) -> Response {
    match assert_public_status(status) {
        Ok(()) => Json(status).into_response(),
        Err(error) => failed(error),
    }
}

async fn registration_snapshot(State(api): State<Api>) -> Json<RegistrationSnapshot> {
    Json(api.registration.snapshot())
}

async fn registration_enable(State(api): State<Api>) -> Response {
    let registration = api.registration.clone();
    match blocking(move || registration.enable()).await {
        Ok(snapshot) => Json(snapshot).into_response(),
        Err(error) => failed(error),
    }
}

async fn bridge_pairing(State(api): State<Api>) -> Response {
    let bridge = api.bridge.clone();
    let result = tokio::task::spawn_blocking(move || bridge.issue_pairing())
        .await
        .map_err(|error| error.to_string());
    match result {
        Ok(Ok(ticket)) => Json(ticket).into_response(),
        Ok(Err(IssueError::Unavailable(error))) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": error })),
        )
            .into_response(),
        Ok(Err(IssueError::Failed(error))) | Err(error) => failed(error),
    }
}

async fn bridge_devices(State(api): State<Api>) -> Response {
    let bridge = api.bridge.clone();
    match blocking(move || bridge.devices()).await {
        Ok(body) => Json(body).into_response(),
        Err(error) => failed(error),
    }
}

async fn bridge_revoke(State(api): State<Api>, Path(device_id): Path<String>) -> Response {
    let bridge = api.bridge.clone();
    match blocking(move || bridge.revoke(&device_id)).await {
        Ok(Some(body)) => Json(body).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "unknown device" })),
        )
            .into_response(),
        Err(error) => failed(error),
    }
}

async fn registration_stop(State(api): State<Api>) -> Response {
    let registration = api.registration.clone();
    match blocking(move || registration.stop()).await {
        Ok(snapshot) => Json(snapshot).into_response(),
        Err(error) => failed(error),
    }
}

/// The token may also arrive in the query: the standard WebSocket API sets no request headers.
#[derive(Deserialize, Default)]
struct WatchQuery {
    token: Option<String>,
}

async fn watch(
    State(api): State<Api>,
    Query(query): Query<WatchQuery>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    let from_query = query
        .token
        .as_deref()
        .is_some_and(|sent| matches(sent, &api.token));
    if !check_token(&headers, &api.token) && !from_query {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    upgrade.on_upgrade(move |socket| stream(socket, api))
}

/// Push each changed public snapshot, until the client goes or the Host stops. A client sends
/// nothing after the upgrade; a frame it does send ends the subscription.
async fn stream(mut socket: WebSocket, api: Api) {
    let mut previous = String::new();
    let mut seen_devices = api.bridge.generation();
    loop {
        if api.exit.load(Ordering::Acquire) {
            break;
        }
        let snapshot = api.lifecycle.snapshot();
        if assert_public_status(&snapshot).is_err() {
            break;
        }
        let encoded = match serde_json::to_string(&snapshot) {
            Ok(encoded) => encoded,
            Err(_) => break,
        };
        if encoded != previous {
            if socket
                .send(Message::Text(encoded.clone().into()))
                .await
                .is_err()
            {
                break;
            }
            previous = encoded;
        }
        let generation = api.bridge.generation();
        if generation != seen_devices {
            seen_devices = generation;
            match api.bridge.devices_event() {
                Ok(event) => {
                    if socket.send(Message::Text(event.into())).await.is_err() {
                        break;
                    }
                }
                Err(error) => {
                    tracing::warn!(%error, "bridge devices");
                }
            }
        }
        tokio::select! {
            _ = tokio::time::sleep(super::WATCH_INTERVAL) => {}
            incoming = socket.recv() => match incoming {
                None | Some(Err(_)) => break,
                Some(Ok(Message::Close(_))) => break,
                Some(Ok(_)) => break,
            },
        }
    }
    let _ = socket.send(Message::Close(None)).await;
}
