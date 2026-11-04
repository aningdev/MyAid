//! Paths and launch configuration (empty shell).

use crate::Result;

#[derive(Debug, Clone)]
pub struct Config {
    pub data_root: String,
}

impl Config {
    pub fn product() -> Result<Self> {
        let home = std::env::var("HOME").map_err(|_| "HOME is unset".to_string())?;
        Ok(Self {
            data_root: format!("{home}/.myaid"),
        })
    }

    pub fn from_args(args: &[String]) -> Result<Self> {
        let mut data_root = None;
        let mut i = 0;
        while i < args.len() {
            if args[i] == "--data-root" {
                i += 1;
                data_root = args.get(i).cloned();
            }
            i += 1;
        }
        Ok(Self {
            data_root: data_root.ok_or_else(|| "missing --data-root".to_string())?,
        })
    }
}
