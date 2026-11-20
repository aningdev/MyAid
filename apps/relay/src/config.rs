//! Bind address and port for the public relay process.

use crate::Result;
use std::net::IpAddr;

/// The address `serve` binds when `--bind` is absent.
pub const DEFAULT_BIND: IpAddr = IpAddr::V4(std::net::Ipv4Addr::LOCALHOST);
/// The port `serve` binds when `--port` is absent.
pub const DEFAULT_PORT: u16 = 8787;

#[derive(Clone)]
pub struct Config {
    pub bind: IpAddr,
    pub port: u16,
    pub version: String,
    /// Announce the bound port on stdout once it listens (`--ready-stdout`).
    pub ready_stdout: bool,
}

impl Config {
    /// `serve [--bind ADDR] [--port PORT] [--ready-stdout]`.
    pub fn from_args(args: &[String]) -> Result<Self> {
        let mut bind = DEFAULT_BIND;
        let mut port = DEFAULT_PORT;
        let mut ready_stdout = false;
        let mut args = args.iter();
        while let Some(key) = args.next() {
            match key.as_str() {
                "--ready-stdout" => ready_stdout = true,
                "--bind" => {
                    let value = args.next().ok_or("Missing argument")?;
                    bind = value.parse().map_err(|_| "Invalid bind address")?;
                }
                "--port" => {
                    let value = args.next().ok_or("Missing argument")?;
                    port = value.parse::<u16>().map_err(|_| "Invalid port")?;
                }
                other => return Err(format!("Unknown argument: {other}")),
            }
        }
        Ok(Self {
            bind,
            port,
            version: env!("CARGO_PKG_VERSION").into(),
            ready_stdout,
        })
    }
}
