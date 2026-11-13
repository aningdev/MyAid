//! Host status: what the control API reports and what a client may believe.
//!
//! Public status never carries the dsh login URL; only `connectionInfo` does, and only while the
//! Host is ready. The Client mirrors these rules in `apps/client/lib/host/protocol.ts`; the
//! shared fixture is `apps/host/testdata/host-contract-cases.json`.

use crate::Result;
use serde::{Deserialize, Serialize};
use url::Url;

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
    /// Only for `connection` responses — leave out of public status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// Parse and assert a dsh ready / connectionInfo login URL.
pub fn parse_ready_url(raw: &str) -> Result<Url> {
    let url = Url::parse(raw.trim()).map_err(|_| "Invalid host connection URL")?;
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
    Ok(url)
}

/// Assert a public status / watch frame (no auth URL).
pub fn assert_public_status(status: &Status) -> Result<()> {
    status.validate(false)
}

/// Assert a connection frame (ready + valid login URL).
pub fn assert_connection_info(status: &Status) -> Result<()> {
    status.validate(true)
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
        parse_ready_url(url)?;
        Ok(())
    }

    pub fn validate_phase(&self) -> Result<()> {
        self.validate(false)
    }
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
    fn contract_cases_from_shared_fixture() {
        #[derive(Deserialize)]
        struct Fixture {
            cases: Vec<Case>,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Case {
            name: String,
            kind: String,
            #[serde(default)]
            url: Option<String>,
            #[serde(default)]
            status: Option<Status>,
            ok: bool,
        }

        let fixture: Fixture = serde_json::from_str(include_str!(
            "../../testdata/host-contract-cases.json"
        ))
        .expect("fixture json");

        for case in fixture.cases {
            let result = match case.kind.as_str() {
                "readyUrl" => parse_ready_url(case.url.as_deref().unwrap()).map(|_| ()),
                "publicStatus" => assert_public_status(case.status.as_ref().unwrap()),
                "connectionInfo" => assert_connection_info(case.status.as_ref().unwrap()),
                other => panic!("unknown case kind {other}"),
            };
            assert_eq!(
                result.is_ok(),
                case.ok,
                "case {} expected ok={} got {:?}",
                case.name,
                case.ok,
                result
            );
        }
    }
}
