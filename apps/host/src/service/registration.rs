//! The registration fact this Host serves: one phase, no other service.

use super::{Status, install, plan};
use crate::{Config, Result};
use serde::{Deserialize, Serialize};

pub const CONTRACT_VERSION: u32 = 1;

/// OS registration fact for the Host (platform-agnostic product phases).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RegistrationPhase {
    NotRegistered,
    PendingApproval,
    Registered,
    Denied,
    Failed,
}

/// `GET /registration`, and the body `enable` and `stop` return after they change it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationSnapshot {
    pub version: u32,
    pub phase: RegistrationPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl RegistrationSnapshot {
    fn new(phase: RegistrationPhase) -> Self {
        Self {
            version: CONTRACT_VERSION,
            phase,
            reason: None,
        }
    }

    fn with_reason(phase: RegistrationPhase, reason: impl Into<String>) -> Self {
        Self {
            version: CONTRACT_VERSION,
            phase,
            reason: Some(reason.into()),
        }
    }
}

#[derive(Clone)]
pub struct Registration {
    config: Config,
}

impl Registration {
    pub fn from_config(config: &Config) -> Self {
        Self {
            config: config.clone(),
        }
    }

    /// The variables the service needs to serve the same data root and port as this process.
    pub fn variables(&self) -> Vec<(&'static str, String)> {
        let mut vars = Vec::new();
        let default_root = plan::home_dir().map(|home| home.join(".dsh-bot"));
        if Some(&self.config.root) != default_root.as_ref() {
            vars.push((
                "DSH_BOT_HOME",
                self.config.root.to_string_lossy().to_string(),
            ));
        }
        if self.config.port != crate::DEFAULT_PORT {
            vars.push(("DSH_BOT_HOST_PORT", self.config.port.to_string()));
        }
        vars
    }

    pub fn snapshot(&self) -> RegistrationSnapshot {
        snapshot_from(&install::status())
    }

    pub fn enable(&self) -> Result<RegistrationSnapshot> {
        install::install(&self.variables())?;
        Ok(self.snapshot())
    }

    pub fn stop(&self) -> Result<RegistrationSnapshot> {
        install::uninstall()?;
        Ok(self.snapshot())
    }
}

/// A registered service that is not running yet waits on the OS, not on the user.
fn snapshot_from(status: &Status) -> RegistrationSnapshot {
    if status.running.is_some() {
        return RegistrationSnapshot::new(RegistrationPhase::Registered);
    }
    if status.installed {
        return RegistrationSnapshot::with_reason(
            RegistrationPhase::PendingApproval,
            format!("已登记，等待启动（{}）", status.log),
        );
    }
    RegistrationSnapshot::with_reason(RegistrationPhase::NotRegistered, "Host 尚未向系统登记")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn config(root: std::path::PathBuf) -> Config {
        let config = Config {
            logs: root.join("logs"),
            root: root.clone(),
            cli: crate::CliSource::Executable(root.join("fake-dsh")),
            version: "test".into(),
            startup_timeout: Duration::from_millis(400),
            patches: Vec::new(),
            port: crate::DEFAULT_PORT,
            ready_stdout: false,
        };
        config.prepare().expect("prepare");
        config
    }

    #[test]
    fn the_snapshot_names_only_the_host() {
        let dir = tempfile::tempdir().expect("tempdir");
        let snapshot = Registration::from_config(&config(dir.path().to_path_buf())).snapshot();
        assert_eq!(snapshot.phase, RegistrationPhase::NotRegistered);
        assert_eq!(snapshot.reason.as_deref(), Some("Host 尚未向系统登记"));
        assert_eq!(snapshot.version, CONTRACT_VERSION);
        let json = serde_json::to_value(&snapshot).expect("json");
        assert!(json.get("host").is_none());
        assert!(json.get("relay").is_none());
        assert!(json.get("availability").is_none());
        assert!(json.get("unit").is_none());
    }

    #[test]
    fn a_service_that_runs_is_registered_and_one_waiting_is_pending() {
        let running = snapshot_from(&Status {
            installed: true,
            running: Some(42),
            log: "host.log".into(),
        });
        assert_eq!(running.phase, RegistrationPhase::Registered);
        assert!(running.reason.is_none());
        let waiting = snapshot_from(&Status {
            installed: true,
            running: None,
            log: "host.log".into(),
        });
        assert_eq!(waiting.phase, RegistrationPhase::PendingApproval);
        assert_eq!(
            waiting.reason.as_deref(),
            Some("已登记，等待启动（host.log）")
        );
        let missing = snapshot_from(&Status {
            installed: false,
            running: None,
            log: "host.log".into(),
        });
        assert_eq!(missing.phase, RegistrationPhase::NotRegistered);
    }

    #[test]
    fn a_scratch_data_root_and_another_port_are_passed_to_the_service() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut config = config(dir.path().to_path_buf());
        config.port = 4999;
        let registration = Registration::from_config(&config);
        let vars = registration.variables();
        assert!(vars.contains(&("DSH_BOT_HOST_PORT", "4999".to_string())));
        assert!(vars.iter().any(|(name, _)| *name == "DSH_BOT_HOME"));
    }
}
