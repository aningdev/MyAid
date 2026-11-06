//! Validated relay paths and launch configuration.

use crate::{Result, private_dir, runtime::home_dir};
use std::path::PathBuf;

#[derive(Clone)]
pub struct Config {
    pub root: PathBuf,
    pub version: String,
    control_socket: Option<PathBuf>,
    /// Explicit dev Relay (`serve` / `serve-app`); skips OS registration side effects.
    pub explicit_dev_relay: bool,
}

impl Config {
    pub fn runtime(&self) -> PathBuf {
        self.root.join("relay")
    }

    pub fn socket(&self) -> PathBuf {
        if let Some(path) = &self.control_socket {
            return path.clone();
        }
        if let Some(path) = std::env::var_os("MYAID_RELAY_SOCKET") {
            return PathBuf::from(path);
        }
        #[cfg(windows)]
        {
            let _ = self;
            PathBuf::from(r"\\.\pipe\myaid-relay")
        }
        #[cfg(not(windows))]
        {
            self.runtime().join("control.sock")
        }
    }

    pub fn product() -> Result<Self> {
        let root = home_dir()?.join(".myaid");
        let config = Self {
            root,
            version: env!("CARGO_PKG_VERSION").into(),
            control_socket: None,
            explicit_dev_relay: true,
        };
        config.prepare()?;
        Ok(config)
    }

    pub fn from_args(args: &[String]) -> Result<Self> {
        let mut root = None;
        let mut version = None;
        let mut control_socket = None;
        let mut args = args.iter();
        while let Some(key) = args.next() {
            match key.as_str() {
                "--data-root" => {
                    root = Some(PathBuf::from(args.next().ok_or("Missing data root")?));
                }
                "--version" => {
                    version = Some(args.next().ok_or("Missing version")?.clone());
                }
                "--control-socket" => {
                    control_socket = Some(PathBuf::from(
                        args.next().ok_or("Missing control socket path")?,
                    ));
                }
                other => return Err(format!("Unknown argument: {other}")),
            }
        }
        let config = Self {
            root: root.ok_or("Missing data root")?,
            version: version.unwrap_or_else(|| env!("CARGO_PKG_VERSION").into()),
            control_socket,
            explicit_dev_relay: true,
        };
        config.prepare()?;
        Ok(config)
    }

    fn prepare(&self) -> Result<()> {
        private_dir(&self.root)?;
        private_dir(&self.runtime())?;
        Ok(())
    }
}
