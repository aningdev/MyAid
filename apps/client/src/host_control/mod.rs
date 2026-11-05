//! Native Host lifecycle adapter; Harness business traffic uses the official client.

mod watch;

use nsh_core::prelude::*;
use std::path::PathBuf;
pub use watch::HostWatch;

/// Local process lifecycle only; carries no Harness business requests.
#[module]
pub struct HostControl;

fn socket_path() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("MYAID_HOST_SOCKET") {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err("宿主 socket 必须是绝对路径".into());
        }
        return Ok(path);
    }
    let home = std::env::var("HOME").map_err(|_| "No home directory")?;
    Ok(PathBuf::from(home).join(".myaid/host/control.sock"))
}

#[module]
impl HostControl {
    /// Whether the private Unix endpoint currently accepts connections.
    pub async fn reachable() -> Result<bool, String> {
        let socket = socket_path()?;
        tokio::task::spawn_blocking(move || std::os::unix::net::UnixStream::connect(socket).is_ok())
            .await
            .map_err(|_| "宿主端点检查中断".to_string())
    }

    /// Subscribe to public state snapshots without authentication data.
    pub async fn watch() -> Result<HostWatch, String> {
        watch::open().await
    }

    /// Issue one validated lifecycle request. Unconfirmed requests are not retried.
    pub async fn request(operation: String, source: String) -> Result<String, String> {
        let socket = socket_path()?;
        let request = serde_json::json!({
            "version": myaid_host::PROTOCOL,
            "id": myaid_host::generation()?,
            "operation": operation,
            "source": if source.is_empty() { None } else { Some(source) }
        });
        tokio::task::spawn_blocking(move || {
            myaid_host::call(&socket, &request)
                .and_then(|value| serde_json::to_string(&value).map_err(|e| e.to_string()))
        })
        .await
        .map_err(|_| "宿主控制任务中断".to_string())?
    }
}
