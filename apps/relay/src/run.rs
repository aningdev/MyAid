//! The relay process: one listening socket, a control API, and a graceful stop.

use crate::{Config, Result, private_file, routes, service::Registration};
use std::{
    io::Write,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

/// How often the stop check and the shutdown wait run.
const TICK: Duration = Duration::from_millis(50);

/// Serve until `exit` is set: bind the port, make or read the token, then answer the API.
pub fn serve(config: Config, exit: &'static AtomicBool) -> Result<()> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?;
    runtime.block_on(serve_async(config, exit))
}

async fn serve_async(config: Config, exit: &'static AtomicBool) -> Result<()> {
    let registration = Registration::from_config(&config);
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, config.port))
        .await
        .map_err(|error| {
            format!(
                "无法绑定 127.0.0.1:{}：{error}。是否已有 Relay 在运行？",
                config.port
            )
        })?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    // Read or made once the port is ours, so a second Relay that fails to bind never replaces it.
    let token = token(&config)?;
    tracing::info!(port, version = %config.version, "dsh-bot-relay listening");
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
        config: config.clone(),
        registration,
        port,
        token: Arc::from(token),
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

/// Read the data root's token, or make one and keep it for later starts.
fn token(config: &Config) -> Result<String> {
    if let Ok(token) = std::fs::read_to_string(config.serve_token_path()) {
        let token = token.trim().to_string();
        if !token.is_empty() {
            return Ok(token);
        }
    }
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    let token = bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let mut file = private_file(&config.serve_token_path())?;
    file.set_len(0).map_err(|error| error.to_string())?;
    file.write_all(token.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|error| error.to_string())?;
    Ok(token)
}
