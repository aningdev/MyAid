//! Paired Devices on disk. Online state stays in memory.

use super::{disk, encode};
use crate::Result;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Clone)]
pub(super) struct Record {
    pub(super) device_id: String,
    pub(super) public_key: [u8; 32],
    pub(super) name: String,
    pub(super) platform: String,
    pub(super) paired_at: u64,
    pub(super) last_seen_at: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FileBody {
    devices: Vec<Stored>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stored {
    device_id: String,
    public_key: String,
    name: String,
    platform: String,
    paired_at: u64,
    last_seen_at: u64,
}

pub(super) fn load(path: &Path) -> Result<Vec<Record>> {
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let body: FileBody =
        serde_json::from_str(&text).map_err(|error| format!("devices.json: {error}"))?;
    body.devices
        .into_iter()
        .map(|stored| {
            let public_key = encode::b64_32(&stored.public_key)?;
            let device_id = encode::public_id(&public_key);
            if device_id != stored.device_id {
                return Err("devices.json device id does not match its public key".into());
            }
            Ok(Record {
                device_id,
                public_key,
                name: stored.name,
                platform: stored.platform,
                paired_at: stored.paired_at,
                last_seen_at: stored.last_seen_at,
            })
        })
        .collect()
}

pub(super) fn save(path: &Path, records: &[Record]) -> Result<()> {
    let body = FileBody {
        devices: records
            .iter()
            .map(|record| Stored {
                device_id: record.device_id.clone(),
                public_key: encode::b64(&record.public_key),
                name: record.name.clone(),
                platform: record.platform.clone(),
                paired_at: record.paired_at,
                last_seen_at: record.last_seen_at,
            })
            .collect(),
    };
    let bytes = serde_json::to_vec_pretty(&body).map_err(|error| error.to_string())?;
    disk::write_private(path, &bytes)
}
