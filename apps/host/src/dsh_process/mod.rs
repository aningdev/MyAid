//! Official dsh process lifecycle (empty shell).
//!
//! Principle (from dsh-bot): this module owns CLI/env/spawn/ready/version/logs/reap
//! and concurrent ensure merging. Public entry will be `Lifecycle`; guardian stays private.
//! `HostControl` must only call that public entry — never locks or guardian internals.

use crate::{Config, Result};

/// Placeholder until `Lifecycle` is implemented.
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
