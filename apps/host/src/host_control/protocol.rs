//! Shared local HostControl protocol (principle-level stub).
//!
//! Migrated shape from dsh-bot `host_control/protocol`: versioned JSON lines over a
//! Unix socket. Full framing I/O and pairing ops land with the real server.
//!
//! Invariants:
//! - `status` / `watchStatus` must never carry authentication URLs or tokens.
//! - `connectionInfo` is the only public op that may include a ready connection URL.
//! - `ensureDsh` distinguishes `attach` vs `userStart`; attach must not clear a user stop.

use crate::Result;

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

/// Public host status (no auth material).
#[derive(Debug, Clone)]
pub struct Status {
    pub phase: String,
    pub generation: Option<String>,
    pub pid: Option<u32>,
    pub version: String,
    pub reason: Option<String>,
    pub blocked: bool,
    /// Only for `connectionInfo` responses — strip before public status.
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

    pub fn validate_phase(&self) -> Result<()> {
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
        Ok(())
    }
}

/// Control-channel request (principle fields).
#[derive(Debug, Clone)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_status_strips_url() {
        let mut status = Status::stopped("0.0.0-placeholder");
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
