//! Encrypted frame relay, resident beside the Host as its own Background Service.
//!
//! Two halves: [`run`] is the process (a local control API today, the forwarding socket once
//! identity and pairing land), and [`service`] is this unit's OS registration. The registration
//! vocabulary lives in `myaid-service`, which the Host uses too.

mod config;
mod routes;
pub mod run;
mod runtime;
pub mod service;

pub use config::{Config, DEFAULT_PORT};
pub use routes::PROTOCOL;
pub use run::serve;
pub use runtime::{generation, home_dir, private_dir, private_file};
pub use service::{Registration, UNIT as SERVICE_UNIT};

pub type Result<T> = std::result::Result<T, String>;
