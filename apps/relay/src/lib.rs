//! Public relay. Pairing and encrypted forwarding are not implemented yet.

mod config;
mod routes;
pub mod run;

pub use config::{Config, DEFAULT_PORT};
pub use routes::PROTOCOL;
pub use run::serve;

pub type Result<T> = std::result::Result<T, String>;
