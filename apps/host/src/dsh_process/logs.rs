//! Bounded rotation for sanitized dsh diagnostic output.

use crate::{Config, Result, private_file};
use std::{
    fs,
    io::{self, Seek, Write},
};

pub(super) fn rotate_log(config: &Config, line: &str) -> Result<()> {
    const MAX_LOG: u64 = 2 * 1024 * 1024;
    let path = config.logs.join("host-dsh.log");
    if fs::metadata(&path).is_ok_and(|metadata| metadata.len() >= MAX_LOG) {
        let _ = fs::remove_file(config.logs.join("host-dsh.log.2"));
        if config.logs.join("host-dsh.log.1").exists() {
            fs::rename(
                config.logs.join("host-dsh.log.1"),
                config.logs.join("host-dsh.log.2"),
            )
            .map_err(|e| e.to_string())?;
        }
        fs::rename(&path, config.logs.join("host-dsh.log.1")).map_err(|e| e.to_string())?;
    }
    let mut file = private_file(&path)?;
    file.seek(io::SeekFrom::End(0)).map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())
}
