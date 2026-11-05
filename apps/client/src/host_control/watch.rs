//! One bounded status subscription; close/disposal releases the blocking reader.

use super::socket_path;
use nsh_core::prelude::*;
use std::{
    io::{BufReader, Write},
    net::Shutdown,
    os::unix::net::UnixStream,
    sync::Arc,
    time::Duration,
};
use tokio::sync::{Mutex, mpsc};

pub(super) async fn open() -> Result<HostWatch, String> {
    let socket = socket_path()?;
    tokio::task::spawn_blocking(move || {
        let mut stream = UnixStream::connect(socket).map_err(|_| "后台宿主尚未运行".to_string())?;
        stream
            .set_write_timeout(Some(Duration::from_secs(3)))
            .map_err(|e| e.to_string())?;
        let id = myaid_host::generation()?;
        writeln!(
            stream,
            "{}",
            serde_json::json!({
                "version": myaid_host::PROTOCOL,
                "id": id,
                "operation": "watchStatus"
            })
        )
        .map_err(|e| e.to_string())?;
        let cancel = stream.try_clone().map_err(|e| e.to_string())?;
        let (sender, receiver) = mpsc::channel(16);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stream);
            loop {
                let result = myaid_host::read_frame(&mut reader).and_then(|line| {
                    let status = myaid_host::decode_response(&line, &id, false)?;
                    serde_json::to_string(&status).map_err(|e| e.to_string())
                });
                let failed = result.is_err();
                if sender.try_send(result).is_err() || failed {
                    break;
                }
            }
        });
        Ok(HostWatch {
            cancel,
            incoming: Arc::new(Mutex::new(receiver)),
        })
    })
    .await
    .map_err(|_| "宿主订阅任务中断".to_string())?
}

/// A bounded, disposable host state subscription.
#[class]
pub struct HostWatch {
    cancel: UnixStream,
    incoming: Arc<Mutex<mpsc::Receiver<Result<String, String>>>>,
}

impl Drop for HostWatch {
    fn drop(&mut self) {
        let _ = self.cancel.shutdown(Shutdown::Both);
    }
}

#[class]
impl HostWatch {
    /// Receive the next public snapshot; rejects on overflow or disconnect.
    pub fn read(&self) -> Later<String> {
        let incoming = self.incoming.clone();
        Later::new(async move {
            incoming
                .lock()
                .await
                .recv()
                .await
                .unwrap_or_else(|| Err("宿主状态订阅已断开".into()))
        })
    }

    /// Release the socket; repeated calls are harmless.
    pub fn close(&self) {
        let _ = self.cancel.shutdown(Shutdown::Both);
    }
}
