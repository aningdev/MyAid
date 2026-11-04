//! Private runtime files and identifiers (empty shell).

use crate::Config;

pub fn private_dir(config: &Config) -> String {
    format!("{}/host", config.data_root)
}
