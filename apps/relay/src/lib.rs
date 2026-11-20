//! Public relay: runner registration and opaque byte forwarding between a
//! Bridge and its Devices.

mod auth;
mod config;
mod device;
mod frame;
mod limits;
mod rate;
mod routes;
pub mod run;
mod runner;
mod tap;

pub use config::{Config, DEFAULT_PORT};
pub use limits::Limits;
pub use routes::PROTOCOL;
pub use run::serve;
use std::ffi::OsString;

pub type Result<T> = std::result::Result<T, String>;

/// `serve [--bind ADDR] [--port PORT] [--ready-stdout] [--frame-tap PATH] [--trusted-proxy IP]`.
pub fn parse_args(args: &[OsString]) -> Result<Config> {
    config::parse(args)
}
