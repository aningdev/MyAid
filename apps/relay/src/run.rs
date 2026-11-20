//! The relay process: one listening socket and a graceful stop.

use crate::{Config, Result, routes};
use std::{
    io::Write,
    net::SocketAddr,
    sync::atomic::{AtomicBool, Ordering},
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
    let api = routes::Api {
        config,
        started: Instant::now(),
    };
    let stopping = async move {
        while !exit.load(Ordering::Acquire) {
            tokio::time::sleep(TICK).await;
        }
        tracing::info!("stopping");
    };
    axum::serve(listener, routes::router(api))
        .with_graceful_shutdown(stopping)
        .await
        .map_err(|error| error.to_string())
}
