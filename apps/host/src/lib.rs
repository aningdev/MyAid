//! Host lifecycle and local control. No Harness business calls or session state.
//! Module layout mirrors dsh-bot: `dsh_process`, `host_control`, `bridge`.

pub mod bridge;
mod config;
pub mod dsh_process;
pub mod host_control;
mod runtime;

pub use config::Config;
pub type Result<T> = std::result::Result<T, String>;
pub use host_control::{Request, Status};
pub use runtime::private_dir;
