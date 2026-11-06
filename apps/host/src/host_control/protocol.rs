//! Shared local HostControl protocol and receiver validation.

use super::transport::LocalStream;
use crate::Result;
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, Read, Write},
    path::Path,
    time::{Duration, Instant},
};

/// Wire protocol version.
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
    "recovering",
];

/// Public host status (no auth material on status/watch).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub phase: String,
    pub generation: Option<String>,
    pub pid: Option<u32>,
    pub version: String,
    pub reason: Option<String>,
    pub blocked: bool,
    /// Only for `connectionInfo` responses — strip before public status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
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
            url: None,
        }
    }

    /// Drop authentication fields for public status / watch payloads.
    pub fn public(&self) -> Self {
        let mut value = self.clone();
        value.url = None;
        value
    }

    pub fn validate(&self, connection_info: bool) -> Result<()> {
        if !PHASES.contains(&self.phase.as_str()) || self.version.is_empty() {
            return Err("Invalid host status".into());
        }
        if self.phase == "ready"
            && (self.generation.as_ref().is_none_or(|id| id.is_empty())
                || self.pid.is_none_or(|pid| pid == 0)
                || self.blocked)
        {
            return Err("Invalid ready host status".into());
        }
        if !connection_info {
            if self.url.is_some() {
                return Err("Public host status contains authentication data".into());
            }
            return Ok(());
        }
        if self.phase != "ready" {
            return Err("Host connection is not ready".into());
        }
        let url = self.url.as_ref().ok_or("Host connection URL missing")?;
        let url = url::Url::parse(url).map_err(|_| "Invalid host connection URL")?;
        if url.scheme() != "http"
            || url.host_str() != Some("127.0.0.1")
            || url.port().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
            || !url
                .query_pairs()
                .any(|(key, value)| key == "token" && !value.is_empty())
        {
            return Err("Invalid host connection URL".into());
        }
        Ok(())
    }

    pub fn validate_phase(&self) -> Result<()> {
        self.validate(false)
    }
}

/// Control-channel request.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub id: String,
    pub operation: String,
    /// For `ensureDsh`: `attach` | `userStart`.
    pub source: Option<String>,
}

impl Request {
    pub fn validate(&self) -> Result<()> {
        if self.version != PROTOCOL {
            return Err("Unsupported host protocol".into());
        }
        if self.id.is_empty() || self.id.len() > 128 {
            return Err("Invalid request ID".into());
        }
        match (self.operation.as_str(), self.source.as_deref()) {
            ("status" | "watchStatus" | "connectionInfo" | "stopDsh" | "restartDsh", None) => {
                Ok(())
            }
            ("ensureDsh", Some("attach" | "userStart")) => Ok(()),
            _ => Err("Invalid host operation or arguments".into()),
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
        return Err("Host frame missing or too large".into());
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
            return Err("Host frame missing or too large".into());
        }
        bytes.extend_from_slice(&buf[..n]);
    }
    if bytes.len() > MAX_FRAME || !bytes.ends_with(b"\n") {
        return Err("Host frame missing or too large".into());
    }
    String::from_utf8(bytes).map_err(|_| "Invalid UTF-8 frame".into())
}

/// Shared receiver validation for one-shot replies and status subscriptions.
pub fn decode_response(text: &str, id: &str, connection_info: bool) -> Result<Status> {
    #[derive(Deserialize)]
    struct Response {
        version: u32,
        id: String,
        ok: bool,
        value: Option<Status>,
        error: Option<String>,
    }
    let response: Response =
        serde_json::from_str(text).map_err(|_| "Invalid host response".to_string())?;
    if response.version != PROTOCOL || response.id != id {
        return Err("Invalid host response".into());
    }
    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "Host operation failed".into()));
    }
    let status = response.value.ok_or("Host response value missing")?;
    status.validate(connection_info)?;
    Ok(status)
}

pub fn call(socket: &Path, request: &serde_json::Value) -> Result<Status> {
    let validated: Request =
        serde_json::from_value(request.clone()).map_err(|_| "Invalid request fields")?;
    validated.validate()?;
    let connection_info = validated.operation == "connectionInfo";
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
    decode_response(&text, &validated.id, connection_info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_status_strips_url() {
        let mut status = Status::stopped("0.2.2-rc.1");
        status.url = Some("http://127.0.0.1:1/?token=x".into());
        assert!(status.public().url.is_none());
    }

    #[test]
    fn ensure_requires_source() {
        let bad = Request {
            version: PROTOCOL,
            id: "1".into(),
            operation: "ensureDsh".into(),
            source: None,
        };
        assert!(bad.validate().is_err());
        let ok = Request {
            version: PROTOCOL,
            id: "1".into(),
            operation: "ensureDsh".into(),
            source: Some("userStart".into()),
        };
        assert!(ok.validate().is_ok());
    }
}
