//! The Host's local control API: `127.0.0.1:<port>` over HTTP, with a websocket for status.
//!
//! Only this computer talks to it. Every route but `/` takes the data root's token
//! ([`auth`]); `/` answers `dsh-bot` so a launcher can tell "a Host answers" from "nothing does".

mod auth;
mod routes;
mod status;

pub use auth::{check_caller, check_token, matches, token};
pub use routes::router;
pub use status::{PHASES, Status, assert_connection_info, assert_public_status, parse_ready_url};

use crate::{Config, Result, dsh_process::Lifecycle, service::Registration};
use std::{
    io::Write,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

/// How many times the status subscription retries a send before it gives up on a client.
const WATCH_INTERVAL: Duration = Duration::from_millis(50);

/// Serve until `exit` is set: bind the port, make or read the token, then answer the API.
pub fn serve(config: Config, exit: &'static AtomicBool) -> Result<()> {
    serve_on(config, exit, None)
}

/// [`serve`], reporting the bound port once it listens: `--port 0` and a test both need the
/// port the OS chose.
pub fn serve_on(
    config: Config,
    exit: &'static AtomicBool,
    ready: Option<std::sync::mpsc::Sender<u16>>,
) -> Result<()> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?;
    runtime.block_on(serve_async(config, exit, ready))
}

async fn serve_async(
    config: Config,
    exit: &'static AtomicBool,
    ready: Option<std::sync::mpsc::Sender<u16>>,
) -> Result<()> {
    let lifecycle = Lifecycle::new(config.clone())?;
    let registration = Registration::from_config(&config);
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, config.port))
        .await
        .map_err(|error| {
            format!(
                "无法绑定 127.0.0.1:{}：{error}。是否已有宿主在运行？",
                config.port
            )
        })?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    // Read or made once the port is ours, so a second Host that fails to bind never replaces it.
    let token = token(&config)?;
    tracing::info!(port, "dsh-bot-host serve");
    if let Some(ready) = ready {
        let _ = ready.send(port);
    }
    if config.ready_stdout {
        // The launcher connects only after this record.
        let mut stdout = std::io::stdout().lock();
        let _ = writeln!(
            stdout,
            "{}",
            serde_json::json!({ "event": "ready", "port": port })
        );
        let _ = stdout.flush();
    }

    // One supervisor for the dsh lifecycle, readable by handlers while a start runs.
    let monitor = lifecycle.clone();
    let ticker = thread::spawn(move || {
        while !exit.load(Ordering::Acquire) {
            if let Err(error) = monitor.tick() {
                tracing::warn!(%error, "host lifecycle");
            }
            thread::sleep(Duration::from_millis(20));
        }
    });

    let api = routes::Api {
        lifecycle,
        registration,
        port,
        token: Arc::from(token),
        exit,
    };
    let stopping = async move {
        while !exit.load(Ordering::Acquire) {
            tokio::time::sleep(WATCH_INTERVAL).await;
        }
        tracing::info!("stopping");
    };
    let served = axum::serve(listener, router(api))
        .with_graceful_shutdown(stopping)
        .await;
    let _ = ticker.join();
    served.map_err(|error| error.to_string())
}
