//! Native Relay registration adapter; business traffic does not use RelayControl.

use nsh_core::prelude::*;
use std::path::PathBuf;

/// Local Relay Background Service control (registration + readiness facts).
#[module]
pub struct RelayControl;

fn socket_path() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("MYAID_RELAY_SOCKET") {
        let path = PathBuf::from(path);
        #[cfg(windows)]
        {
            let text = path.to_string_lossy();
            if !(text.starts_with(r"\\.\pipe\") || text.starts_with("//./pipe/")) {
                return Err("转发端点必须是 \\\\.\\pipe\\... 命名管道路径".into());
            }
            return Ok(path);
        }
        #[cfg(not(windows))]
        {
            if !path.is_absolute() {
                return Err("转发 socket 必须是绝对路径".into());
            }
            return Ok(path);
        }
    }
    Ok(myaid_relay::default_endpoint())
}

#[module]
impl RelayControl {
    /// Whether RelayControl accepts connections on the product endpoint.
    pub async fn reachable() -> Result<bool, String> {
        let socket = socket_path()?;
        tokio::task::spawn_blocking(move || myaid_relay::LocalStream::connect(&socket).is_ok())
            .await
            .map_err(|_| "转发端点检查中断".to_string())
    }

    /// One registration or readiness request; returns JSON `value` as a string.
    pub async fn request(operation: String) -> Result<String, String> {
        let socket = socket_path()?;
        let op = operation.clone();
        let request = serde_json::json!({
            "version": myaid_relay::PROTOCOL,
            "id": myaid_relay::generation()?,
            "operation": operation,
        });
        tokio::task::spawn_blocking(move || {
            let value = match op.as_str() {
                "registrationQuery" | "registrationEnable" | "registrationStop" => {
                    myaid_relay::call_json(&socket, &request)?
                }
                _ => {
                    let status = myaid_relay::call(&socket, &request)?;
                    serde_json::to_value(status).map_err(|e| e.to_string())?
                }
            };
            serde_json::to_string(&value).map_err(|e| e.to_string())
        })
        .await
        .map_err(|_| "转发控制任务中断".to_string())?
    }
}
