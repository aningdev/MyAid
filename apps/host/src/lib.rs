//! Host lifecycle and its local control API. No Harness business calls or session state.
//! Modules: `dsh_process` (the dsh lifecycle), `local_api` (the loopback HTTP/websocket API),
//! `service` (the Host's OS registration), `bridge` (relay identity, Noise, paired Devices).

pub mod bridge;
mod config;
pub mod dsh_process;
pub mod local_api;
mod runtime;
pub mod service;

pub use config::{CliSource, Config, DEFAULT_PORT, STARTUP_TIMEOUT};
pub type Result<T> = std::result::Result<T, String>;
pub use local_api::{
    PHASES, Status, assert_connection_info, assert_public_status, parse_ready_url,
};
pub use runtime::{generation, now, private_dir, private_file};
pub use service::{LABEL as SERVICE_LABEL, Registration};

/// The control API generation, so a launcher and a Host can agree on the shape they speak.
pub const PROTOCOL: u32 = 2;
