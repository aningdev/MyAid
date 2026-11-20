//! Private files under `host/bridge/`: create the directory, write 0600, replace atomically.

use crate::{Result, private_dir};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

pub(super) fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        private_dir(parent)?;
    }
    let tmp = temp_path(path)?;
    let write = (|| {
        let mut file = open_private(&tmp)?;
        file.write_all(bytes).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        file.set_len(bytes.len() as u64)
            .map_err(|error| error.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|error| error.to_string())?;
        }
        drop(file);
        replace(&tmp, path)?;
        #[cfg(unix)]
        sync_parent(path);
        Ok(())
    })();
    if write.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    write
}

fn open_private(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(|error| error.to_string())
}

fn temp_path(path: &Path) -> Result<PathBuf> {
    let mut nonce = [0u8; 8];
    getrandom::fill(&mut nonce).map_err(|error| error.to_string())?;
    let suffix: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("bridge");
    Ok(path.with_file_name(format!(".{name}.{suffix}.tmp")))
}

fn replace(tmp: &Path, path: &Path) -> Result<()> {
    // Windows `rename` does not replace. A single Host writes each of these files.
    #[cfg(windows)]
    {
        let _ = fs::remove_file(path);
    }
    fs::rename(tmp, path).map_err(|error| error.to_string())
}

#[cfg(unix)]
fn sync_parent(path: &Path) {
    if let Some(parent) = path.parent()
        && let Ok(dir) = File::open(parent)
    {
        let _ = dir.sync_all();
    }
}
