//! Local host control Interface (empty shell).

use crate::{Config, Result};

#[derive(Debug, Clone)]
pub struct Request {
    pub operation: String,
}

#[derive(Debug, Clone)]
pub struct Status {
    pub phase: String,
}

pub fn serve(config: Config) -> Result<()> {
    Err(format!(
        "myaid-host empty shell: serve not implemented (data_root={})",
        config.data_root
    ))
}
