//! Bind address, port and trusted proxies for the public relay process.

use crate::Result;
use std::{collections::HashSet, ffi::OsString, net::IpAddr, path::PathBuf, time::Duration};

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
    /// TCP peers allowed to name the client with `X-Forwarded-For`.
    pub trusted_proxies: HashSet<IpAddr>,
    /// Record every relayed frame here (`--frame-tap`, `frame-tap` builds only).
    pub frame_tap: Option<PathBuf>,
    /// How long a Device may stay silent after connecting (`--idle-ms`); tests shorten it.
    pub idle: Duration,
}

/// `serve [--bind ADDR] [--port PORT] [--ready-stdout] [--frame-tap PATH] [--trusted-proxy IP] [--idle-ms MS]`.
pub fn parse(args: &[OsString]) -> Result<Config> {
    let mut bind = DEFAULT_BIND;
    let mut port = DEFAULT_PORT;
    let mut ready_stdout = false;
    let mut trusted_proxies = HashSet::new();
    let mut frame_tap = None;
    let mut idle = crate::limits::IDLE;
    let mut args = args.iter();
    while let Some(key) = args.next() {
        match key.to_string_lossy().as_ref() {
            "--ready-stdout" => ready_stdout = true,
            "--bind" => {
                let value = args.next().ok_or("Missing argument")?;
                bind = value
                    .to_string_lossy()
                    .parse()
                    .map_err(|_| "Invalid bind address")?;
            }
            "--port" => {
                let value = args.next().ok_or("Missing argument")?;
                port = value
                    .to_string_lossy()
                    .parse::<u16>()
                    .map_err(|_| "Invalid port")?;
            }
            "--trusted-proxy" => {
                let value = args.next().ok_or("Missing argument")?;
                let proxy = value
                    .to_string_lossy()
                    .parse()
                    .map_err(|_| "Invalid proxy address")?;
                trusted_proxies.insert(proxy);
            }
            "--frame-tap" => {
                let value = args.next().ok_or("Missing argument")?;
                frame_tap = Some(PathBuf::from(value));
            }
            "--idle-ms" => {
                let value = args.next().ok_or("Missing argument")?;
                let millis = value
                    .to_string_lossy()
                    .parse::<u64>()
                    .ok()
                    .filter(|millis| *millis > 0)
                    .ok_or("Invalid idle milliseconds")?;
                idle = Duration::from_millis(millis);
            }
            other => return Err(format!("Unknown argument: {other}")),
        }
    }
    Ok(Config {
        bind,
        port,
        version: env!("CARGO_PKG_VERSION").into(),
        ready_stdout,
        trusted_proxies,
        frame_tap,
        idle,
    })
}
