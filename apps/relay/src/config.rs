//! Validated Relay paths and launch configuration.

use crate::Result;
use std::path::PathBuf;

/// The local control and forwarding port when nothing names one.
pub const DEFAULT_PORT: u16 = 8787;

#[derive(Clone)]
pub struct Config {
    pub root: PathBuf,
    pub version: String,
    /// The local port on `127.0.0.1`.
    pub port: u16,
    /// Announce the bound port on stdout once it listens (`--ready-stdout`).
    pub ready_stdout: bool,
}

impl Config {
    pub fn runtime(&self) -> PathBuf {
        self.root.join("relay")
    }

    /// The token every local control request carries, in the private runtime directory.
    pub fn serve_token_path(&self) -> PathBuf {
        self.runtime().join("serve-token")
    }

    /// `~/.dsh-bot` (`DSH_BOT_HOME` names another), with the version this build carries.
    pub fn product() -> Result<Self> {
        let root = match std::env::var_os("DSH_BOT_HOME") {
            Some(root) if !root.is_empty() => PathBuf::from(root),
            _ => crate::home_dir()?.join(".dsh-bot"),
        };
        let config = Self {
            root,
            version: env!("CARGO_PKG_VERSION").into(),
            port: port_from_env()?,
            ready_stdout: false,
        };
        config.prepare()?;
        Ok(config)
    }

    /// `serve-app`: the product data root, with only the launch flags a launcher passes.
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

    pub fn from_args(args: &[String]) -> Result<Self> {
        let mut root = None;
        let mut version = None;
        let mut port = port_from_env()?;
        let mut ready_stdout = false;
        let mut args = args.iter();
        while let Some(key) = args.next() {
            match key.as_str() {
                "--ready-stdout" => ready_stdout = true,
                other => {
                    let value = args.next().ok_or("Missing argument")?;
                    match other {
                        "--data-root" => root = Some(PathBuf::from(value)),
                        "--port" => port = value.parse::<u16>().map_err(|_| "Invalid port")?,
                        "--version" => version = Some(value.clone()),
                        _ => return Err(format!("Unknown argument: {other}")),
                    }
                }
            }
        }
        let config = Self {
            root: root.ok_or("Missing data root")?,
            version: version.unwrap_or_else(|| env!("CARGO_PKG_VERSION").into()),
            port,
            ready_stdout,
        };
        config.prepare()?;
        Ok(config)
    }

    /// What `service install` passes on, so the service serves this data root and port.
    pub fn variables(&self) -> Vec<(&'static str, String)> {
        let mut vars = Vec::new();
        if Some(&self.root) != crate::home_dir().ok().map(|home| home.join(".dsh-bot")).as_ref() {
            vars.push((
                "DSH_BOT_HOME",
                self.root.to_string_lossy().to_string(),
            ));
        }
        if self.port != DEFAULT_PORT {
            vars.push(("DSH_BOT_RELAY_PORT", self.port.to_string()));
        }
        vars
    }

    fn prepare(&self) -> Result<()> {
        if !self.root.is_absolute() {
            return Err("Data root must be an absolute path".into());
        }
        crate::private_dir(&self.root)?;
        crate::private_dir(&self.runtime())
    }
}

/// `DSH_BOT_RELAY_PORT`, else [`DEFAULT_PORT`].
fn port_from_env() -> Result<u16> {
    match std::env::var("DSH_BOT_RELAY_PORT") {
        Ok(text) if !text.trim().is_empty() => text
            .trim()
            .parse::<u16>()
            .map_err(|_| "Invalid port".into()),
        _ => Ok(DEFAULT_PORT),
    }
}
