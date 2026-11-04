//! Official dsh process lifecycle (empty shell).
//! Named to mirror dsh-bot; implementation lands with real CLI ownership.

use crate::{Config, Result};

pub fn run_guardian(config: &Config) -> Result<()> {
    Err(format!(
        "myaid-host empty shell: guardian not implemented (data_root={})",
        config.data_root
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guardian_reports_empty_shell() {
        let config = Config {
            data_root: "/tmp/myaid-test".into(),
        };
        let err = run_guardian(&config).unwrap_err();
        assert!(err.contains("empty shell"));
    }
}
