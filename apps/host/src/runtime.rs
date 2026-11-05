//! Private runtime files and per-launch identifiers.

use crate::Result;
use std::{
    fs::{self, File, OpenOptions},
    io::Read,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub fn private_dir(path: &Path) -> Result<()> {
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    use std::os::unix::fs::MetadataExt;
    if !metadata.is_dir() || metadata.uid() != unsafe { libc::geteuid() } {
        return Err("Runtime directory must be owned by the current user".into());
    }
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())
}

pub fn private_file(path: &Path) -> Result<File> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
        .map_err(|e| e.to_string())
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn generation() -> Result<String> {
    let mut bytes = [0u8; 16];
    File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
