//! Host lifecycle and local control. No Harness business calls or session state.
//! Modules: `dsh_process`, `host_control`, `bridge`.

pub mod bridge;
mod background_registration;
mod config;
pub mod dsh_process;
pub mod host_control;
mod runtime;

pub use background_registration::HostRegistration;
pub use config::{CliSource, Config, STARTUP_TIMEOUT};
pub type Result<T> = std::result::Result<T, String>;
pub use host_control::{
    MAX_FRAME, PROTOCOL, Request, Status, call, decode_response, default_endpoint, read_frame,
};
pub use myaid_background_service as background_service;
pub use host_control::transport::LocalStream;
pub use runtime::{generation, now, private_dir, private_file};
