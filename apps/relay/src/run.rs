//! The relay process: one listening socket and a graceful stop.

use crate::{
    Config, Result, limits::Limits, rate::RateLimiter, routes, runner::Registry, tap::Tap,
};
use std::{
    io::Write,
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

/// How often the stop check runs.
const TICK: Duration = Duration::from_millis(50);

/// Serve until `exit` is set.
pub fn serve(config: Config, exit: &'static AtomicBool) -> Result<()> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?;
    runtime.block_on(serve_async(config, exit))
}

async fn serve_async(config: Config, exit: &'static AtomicBool) -> Result<()> {
    let listener = tokio::net::TcpListener::bind(SocketAddr::new(config.bind, config.port))
        .await
        .map_err(|error| format!("无法绑定 {}:{}：{error}", config.bind, config.port))?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    tracing::info!(%config.bind, port, version = %config.version, "dsh-bot-relay listening");
    if config.ready_stdout {
        let mut stdout = std::io::stdout().lock();
        let _ = writeln!(
            stdout,
            "{}",
            serde_json::json!({ "event": "ready", "port": port })
        );
        let _ = stdout.flush();
    }
    let tap = Tap::from_path(config.frame_tap.as_deref()).map_err(|error| {
        format!(
            "无法打开 {}：{error}",
            config
                .frame_tap
                .as_ref()
                .map(|path| path.display().to_string())
                .unwrap_or_default()
        )
    })?;
    let limits = Limits::default();
    let api = routes::Api {
        registry: Arc::new(Registry::new()),
        rate: Arc::new(RateLimiter::new(
            limits.connect_rate,
            limits.connect_rate_window,
        )),
        tap,
        limits,
        config,
        started: Instant::now(),
    };
    let stopping = async move {
        while !exit.load(Ordering::Acquire) {
            tokio::time::sleep(TICK).await;
        }
        tracing::info!("stopping");
    };
    axum::serve(
        listener,
        routes::router(api).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(stopping)
    .await
    .map_err(|error| error.to_string())
}
