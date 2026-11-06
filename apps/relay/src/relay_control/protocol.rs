//! Shared local RelayControl protocol and receiver validation.

use super::transport::LocalStream;
use crate::Result;
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, Read, Write},
    path::Path,
    time::{Duration, Instant},
};

/// Wire protocol version (parallel to HostControl).
pub const PROTOCOL: u32 = 1;

/// Soft max for one JSON frame (bytes).
pub const MAX_FRAME: usize = 16 * 1024;

/// Lifecycle phases published on the control channel.
pub const PHASES: &[&str] = &[
    "stopped",
    "preparing",
    "starting",
    "ready",
    "stopping",
    "failed",
];

/// Public relay status (no auth material; RelayControl does not expose connection URLs).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub phase: String,
    pub generation: Option<String>,
    pub pid: Option<u32>,
    pub version: String,
    pub reason: Option<String>,
    pub blocked: bool,
}

impl Status {
    pub fn stopped(version: impl Into<String>) -> Self {
        Self {
            phase: "stopped".into(),
            generation: None,
            pid: None,
            version: version.into(),
            reason: Some("请明确启动后台".into()),
            blocked: true,
        }
    }

    pub fn ready(version: impl Into<String>, generation: String, pid: u32) -> Self {
        Self {
            phase: "ready".into(),
            generation: Some(generation),
            pid: Some(pid),
            version: version.into(),
            reason: None,
            blocked: false,
        }
    }

    pub fn validate(&self) -> Result<()> {
        if !PHASES.contains(&self.phase.as_str()) || self.version.is_empty() {
            return Err("Invalid relay status".into());
        }
        if self.phase == "ready"
            && (self.generation.as_ref().is_none_or(|id| id.is_empty())
                || self.pid.is_none_or(|pid| pid == 0)
                || self.blocked)
        {
            return Err("Invalid ready relay status".into());
        }
        Ok(())
    }
}

/// Assert a public status / watch frame.
pub fn assert_public_status(status: &Status) -> Result<()> {
    status.validate()
}

/// Control-channel request.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub id: String,
    pub operation: String,
}

impl Request {
    pub fn validate(&self) -> Result<()> {
        if self.version != PROTOCOL {
            return Err("Unsupported relay protocol".into());
        }
        if self.id.is_empty() || self.id.len() > 128 {
            return Err("Invalid request ID".into());
        }
        match self.operation.as_str() {
            "status" | "watchStatus" => Ok(()),
            _ => Err("Invalid relay operation or arguments".into()),
        }
    }
}

pub fn read_frame(reader: &mut impl BufRead) -> Result<String> {
    let mut bytes = Vec::new();
    reader
        .take((MAX_FRAME + 1) as u64)
        .read_until(b'\n', &mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FRAME || !bytes.ends_with(b"\n") {
        return Err("Relay frame missing or too large".into());
    }
    String::from_utf8(bytes).map_err(|_| "Invalid UTF-8 frame".into())
}

fn read_frame_deadline(stream: &mut LocalStream, deadline: Instant) -> Result<String> {
    let mut bytes = Vec::new();
    let mut buf = [0u8; 256];
    while bytes.len() <= MAX_FRAME && !bytes.ends_with(b"\n") {
        let n = stream
            .read_with_deadline(&mut buf, deadline)
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("Relay frame missing or too large".into());
        }
        bytes.extend_from_slice(&buf[..n]);
    }
    if bytes.len() > MAX_FRAME || !bytes.ends_with(b"\n") {
        return Err("Relay frame missing or too large".into());
    }
    String::from_utf8(bytes).map_err(|_| "Invalid UTF-8 frame".into())
}

pub fn decode_response(text: &str, id: &str) -> Result<Status> {
    #[derive(Deserialize)]
    struct Response {
        version: u32,
        id: String,
        ok: bool,
        value: Option<Status>,
        error: Option<String>,
    }
    let response: Response =
        serde_json::from_str(text).map_err(|_| "Invalid relay response".to_string())?;
    if response.version != PROTOCOL || response.id != id {
        return Err("Invalid relay response".into());
    }
    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "Relay operation failed".into()));
    }
    let status = response.value.ok_or("Relay response value missing")?;
    status.validate()?;
    Ok(status)
}

pub fn call(socket: &Path, request: &serde_json::Value) -> Result<Status> {
    let validated: Request =
        serde_json::from_value(request.clone()).map_err(|_| "Invalid request fields")?;
    validated.validate()?;
    let mut stream = LocalStream::connect(socket)?;
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec(request).map_err(|e| e.to_string())?;
    if bytes.len() >= MAX_FRAME {
        return Err("Request too large".into());
    }
    stream
        .write_all(&bytes)
        .and_then(|_| stream.write_all(b"\n"))
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(30);
    let text = read_frame_deadline(&mut stream, deadline)?;
    decode_response(&text, &validated.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Config, relay_control::serve};
    use std::{
        sync::atomic::{AtomicBool, Ordering},
        thread,
        time::Duration,
    };

    #[test]
    fn ready_status_validates() {
        let status = Status::ready("0.1.0", "abc".into(), 1);
        assert!(status.validate().is_ok());
    }

    #[test]
    fn relay_control_answers_status_while_serving() {
        let dir = tempfile::tempdir().expect("tempdir");
        let data_root = dir.path().join("data");
        let socket = dir.path().join("control.sock");
        let config = Config::from_args(&[
            "--data-root".into(),
            data_root.to_string_lossy().into(),
            "--version".into(),
            "0.1.0-test".into(),
            "--control-socket".into(),
            socket.to_string_lossy().into(),
        ])
        .expect("config");
        let exit: &'static AtomicBool = Box::leak(Box::new(AtomicBool::new(false)));
        let exit_for_serve = exit;
        let handle = thread::spawn(move || serve(config, exit_for_serve));
        for _ in 0..100 {
            if socket.exists() {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert!(socket.exists(), "control socket should exist while serving");

        let status = call(
            &socket,
            &serde_json::json!({
                "version": PROTOCOL,
                "id": "t1",
                "operation": "status",
            }),
        )
        .expect("status call");
        assert_eq!(status.phase, "ready");
        assert_eq!(status.version, "0.1.0-test");
        assert!(!status.blocked);

        exit.store(true, Ordering::Release);
        handle.join().expect("serve thread").expect("serve");
    }
}
