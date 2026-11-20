//! Validated host paths and launch configuration.

use crate::{Result, private_dir, runtime::home_dir};
use std::{path::PathBuf, time::Duration};

/// Default startup deadline when unset.
pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// The local control port when nothing names one (`DSH_BOT_HOST_PORT`, `--port`).
pub const DEFAULT_PORT: u16 = 4872;

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
    /// Extra dsh overlay patch files (`dsh --patch …`), in application order.
    pub patches: Vec<PathBuf>,
    /// The local control port on `127.0.0.1`.
    pub port: u16,
    /// Announce the bound port on stdout once it listens (`--ready-stdout`), which a launcher
    /// and a test read instead of guessing.
    pub ready_stdout: bool,
}

impl Config {
    pub fn runtime(&self) -> PathBuf {
        self.root.join("host")
    }

    /// The token every local control request carries, in the private runtime directory.
    pub fn serve_token_path(&self) -> PathBuf {
        self.runtime().join("serve-token")
    }

    /// Product defaults: `~/.dsh-bot` (`DSH_BOT_HOME` names another), official dsh, embedded
    /// version pin.
    pub fn product() -> Result<Self> {
        let root = match std::env::var_os("DSH_BOT_HOME") {
            Some(root) if !root.is_empty() => PathBuf::from(root),
            _ => home_dir()?.join(".dsh-bot"),
        };
        let config = Self {
            logs: root.join("logs"),
            root,
            cli: CliSource::Official,
            version: pinned_version()?,
            startup_timeout: STARTUP_TIMEOUT,
            patches: patches_from_env()?,
            port: port_from_env()?,
            ready_stdout: false,
        };
        config.prepare()?;
        Ok(config)
    }

    /// `serve-app`: the product data root and pinned CLI, with only the launch flags a launcher
    /// passes (`--port`, `--ready-stdout`).
    pub fn app(args: &[String]) -> Result<Self> {
        let mut config = Self::product()?;
        let mut args = args.iter();
        while let Some(flag) = args.next() {
            match flag.as_str() {
                "--ready-stdout" => config.ready_stdout = true,
                "--port" => {
                    let value = args.next().ok_or("Missing argument")?;
                    config.port = value.parse::<u16>().map_err(|_| "Invalid port")?;
                }
                other => return Err(format!("Unknown argument: {other}")),
            }
        }
        Ok(config)
    }

    /// Isolation entry used by `serve`, `guardian`, and tests.
    pub fn from_args(args: &[String]) -> Result<Self> {
        let mut root = None;
        let mut cli = None;
        let mut version = None;
        let mut startup = STARTUP_TIMEOUT.as_millis() as u64;
        let mut patches = Vec::new();
        let mut port = port_from_env()?;
        let mut ready_stdout = false;
        let mut args = args.iter();
        while let Some(key) = args.next() {
            match key.as_str() {
                "--official-dsh" => {
                    if cli.is_some() {
                        return Err("CLI source specified more than once".into());
                    }
                    cli = Some(CliSource::Official);
                }
                "--ready-stdout" => ready_stdout = true,
                key => {
                    let value = args.next().ok_or("Missing argument")?;
                    match key {
                        "--data-root" => root = Some(PathBuf::from(value)),
                        "--port" => {
                            port = value.parse::<u16>().map_err(|_| "Invalid port")?;
                        }
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
                        "--patch" => {
                            let path = PathBuf::from(value);
                            if !path.is_absolute() {
                                return Err("Patch path must be absolute".into());
                            }
                            patches.push(path);
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
            patches,
            port,
            ready_stdout,
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
        for patch in &self.patches {
            args.push("--patch".into());
            args.push(patch.to_string_lossy().into_owned());
        }
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
        for patch in &self.patches {
            if !patch.is_absolute() {
                return Err("Patch path must be absolute".into());
            }
        }
        private_dir(&self.root)?;
        private_dir(&self.runtime())?;
        private_dir(&self.logs)
    }
}

/// Dev-only overlays from `DSH_BOT_PATCH`; paths are split like `PATH`.
fn patches_from_env() -> Result<Vec<PathBuf>> {
    let Some(value) = std::env::var_os("DSH_BOT_PATCH") else {
        return Ok(Vec::new());
    };
    let mut patches = Vec::new();
    for path in std::env::split_paths(&value) {
        if path.as_os_str().is_empty() {
            continue;
        }
        if !path.is_absolute() {
            return Err("DSH_BOT_PATCH paths must be absolute".into());
        }
        patches.push(path);
    }
    Ok(patches)
}

/// `DSH_BOT_HOST_PORT`, else [`DEFAULT_PORT`].
fn port_from_env() -> Result<u16> {
    match std::env::var("DSH_BOT_HOST_PORT") {
        Ok(text) if !text.trim().is_empty() => text
            .trim()
            .parse::<u16>()
            .map_err(|_| "Invalid port".into()),
        _ => Ok(DEFAULT_PORT),
    }
}

fn pinned_version() -> Result<String> {
    let pin: serde_json::Value =
        serde_json::from_str(SUPPORTED_DSH).map_err(|_| "无效发行版配置")?;
    Ok(pin["version"].as_str().ok_or("缺少发行版版本")?.to_owned())
}
