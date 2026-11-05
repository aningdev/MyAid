//! Durable user intent and restart budget owned by the lifecycle module.

use crate::{Config, Result, private_file};
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
