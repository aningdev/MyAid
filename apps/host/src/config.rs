//! Validated host paths and launch configuration.

use crate::{Result, private_dir, runtime::home_dir};
use std::{path::PathBuf, time::Duration};

/// Default startup deadline when unset.
pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

const SUPPORTED_DSH: &str = include_str!("../supported-dsh.json");

#[derive(Clone)]
pub enum CliSource {
    /// Resolve the official `dsh` executable from the login-shell PATH.
    Official,
    /// Absolute path for isolated tests and fixtures.
    Executable(PathBuf),
}

#[derive(Clone)]
pub struct Config {
    pub root: PathBuf,
    pub cli: CliSource,
    pub logs: PathBuf,
    pub version: String,
    pub startup_timeout: Duration,
    /// Explicit dev Host (`serve` / `serve-app`); skips OS registration side effects.
    pub explicit_dev_host: bool,
}

impl Config {
    pub fn runtime(&self) -> PathBuf {
        self.root.join("host")
    }

    pub fn socket(&self) -> PathBuf {
        if let Some(path) = std::env::var_os("MYAID_HOST_SOCKET") {
            return PathBuf::from(path);
        }
        #[cfg(windows)]
        {
            let _ = self;
            PathBuf::from(r"\\.\pipe\myaid-host")
        }
        #[cfg(not(windows))]
        {
            self.runtime().join("control.sock")
        }
    }

    /// Product defaults: `~/.myaid`, official dsh, embedded version pin.
    pub fn product() -> Result<Self> {
        let root = home_dir()?.join(".myaid");
        let config = Self {
            logs: root.join("logs"),
            root,
            cli: CliSource::Official,
            version: pinned_version()?,
            startup_timeout: STARTUP_TIMEOUT,
            explicit_dev_host: true,
        };
        config.prepare()?;
        Ok(config)
    }

    /// Isolation entry used by `serve`, `guardian`, and tests.
    pub fn from_args(args: &[String]) -> Result<Self> {
        let mut root = None;
        let mut cli = None;
        let mut version = None;
        let mut startup = STARTUP_TIMEOUT.as_millis() as u64;
        let mut args = args.iter();
        while let Some(key) = args.next() {
            match key.as_str() {
                "--official-dsh" => {
                    if cli.is_some() {
                        return Err("CLI source specified more than once".into());
                    }
                    cli = Some(CliSource::Official);
                }
                key => {
                    let value = args.next().ok_or("Missing argument")?;
                    match key {
                        "--data-root" => root = Some(PathBuf::from(value)),
                        "--dsh" => {
                            if cli.is_some() {
                                return Err("CLI source specified more than once".into());
                            }
                            let path = PathBuf::from(value);
                            if !path.is_absolute() {
                                return Err("CLI path must be absolute".into());
                            }
                            cli = Some(CliSource::Executable(path));
                        }
                        "--version" => version = Some(value.clone()),
                        "--startup-ms" => {
                            startup = value
                                .parse::<u64>()
                                .map_err(|_| "Invalid startup deadline")?;
                        }
                        _ => return Err(format!("Unknown argument: {key}")),
                    }
                }
            }
        }
        if !(100..=180_000).contains(&startup) {
            return Err("Invalid startup deadline".into());
        }
        let root = root.ok_or("Missing data root")?;
        let config = Self {
            logs: root.join("logs"),
            root,
            cli: cli.unwrap_or(CliSource::Official),
            version: match version {
                Some(v) => v,
                None => pinned_version()?,
            },
            startup_timeout: Duration::from_millis(startup),
            explicit_dev_host: true,
        };
        config.prepare()?;
        Ok(config)
    }

    /// Serialize this config for guardian handoff.
    pub fn arguments(&self) -> Vec<String> {
        let mut args = vec![
            "--data-root".into(),
            self.root.to_string_lossy().into_owned(),
        ];
        match &self.cli {
            CliSource::Official => args.push("--official-dsh".into()),
            CliSource::Executable(path) => {
                args.push("--dsh".into());
                args.push(path.to_string_lossy().into_owned());
            }
        }
        args.push("--version".into());
        args.push(self.version.clone());
        args.push("--startup-ms".into());
        args.push(self.startup_timeout.as_millis().to_string());
        args
    }

    pub fn prepare(&self) -> Result<()> {
        if !self.root.is_absolute() || !self.logs.is_absolute() {
            return Err("Paths must be absolute".into());
        }
        if let CliSource::Executable(path) = &self.cli
            && !path.is_absolute()
        {
            return Err("CLI path must be absolute".into());
        }
        private_dir(&self.root)?;
        private_dir(&self.runtime())?;
        private_dir(&self.logs)
    }
}

fn pinned_version() -> Result<String> {
    let pin: serde_json::Value =
        serde_json::from_str(SUPPORTED_DSH).map_err(|_| "无效发行版配置")?;
    Ok(pin["version"]
        .as_str()
        .ok_or("缺少发行版版本")?
        .to_owned())
}
