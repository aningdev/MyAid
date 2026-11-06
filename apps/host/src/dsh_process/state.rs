//! Durable user intent and private process state owned by the lifecycle module.

use crate::{Config, Result, Status, private_file};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
};
#[cfg(unix)]
use std::fs::File;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Durable {
    pub user_started: bool,
    pub stopped: bool,
    pub exhausted: bool,
    pub failures: Vec<u64>,
}

impl Durable {
    pub(super) fn load(config: &Config) -> Result<Self> {
        match fs::read(config.runtime().join("state.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|_| "宿主生命周期记录损坏，请检查后重试；不会自动启动".into()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e.to_string()),
        }
    }

    pub(super) fn save(&self, config: &Config) -> Result<()> {
        let temp = config.runtime().join("state.json.tmp");
        let mut file = private_file(&temp)?;
        file.set_len(0).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(self).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temp, config.runtime().join("state.json")).map_err(|e| e.to_string())?;
        // Directory fsync is Unix-oriented; Windows rejects opening directories as files.
        #[cfg(unix)]
        File::open(config.runtime())
            .and_then(|file| file.sync_all())
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        let _ = config;
        Ok(())
    }
}

/// Private lifecycle state. Mapped to wire [`Status`] only at the Lifecycle seam.
#[derive(Debug, Clone)]
pub(super) struct ProcessState {
    pub phase: String,
    pub generation: Option<String>,
    pub pid: Option<u32>,
    pub version: String,
    pub reason: Option<String>,
    pub blocked: bool,
    pub url: Option<String>,
}

impl ProcessState {
    pub(super) fn stopped(version: impl Into<String>) -> Self {
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

    /// Wire DTO for public status / watch — never carries auth URL.
    pub(super) fn to_public(&self) -> Status {
        Status {
            phase: self.phase.clone(),
            generation: self.generation.clone(),
            pid: self.pid,
            version: self.version.clone(),
            reason: self.reason.clone(),
            blocked: self.blocked,
            url: None,
        }
    }

    /// Wire DTO for connectionInfo — includes ready URL when present.
    pub(super) fn to_connection(&self) -> Status {
        Status {
            phase: self.phase.clone(),
            generation: self.generation.clone(),
            pid: self.pid,
            version: self.version.clone(),
            reason: self.reason.clone(),
            blocked: self.blocked,
            url: self.url.clone(),
        }
    }
}
