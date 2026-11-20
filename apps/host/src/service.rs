//! Host unit OS registration: the shared launch plan, named for this unit.
//!
//! The Host reports only its own unit's fact; the Relay's phase in its snapshot is always
//! `notRegistered`, and the Client merges the two snapshots.

use crate::{Config, Result};
use dsh_bot_service::{
    RegistrationPhase, RegistrationSnapshot, ServiceUnit, Status as ServiceStatus, Unit,
    UnitRegistration,
};

/// The Host's Background Service unit: `serve-app` at login, logging beside the app's logs.
pub const UNIT: Unit = Unit {
    label: "com.aningdev.dshbot.host",
    systemd_unit: "dsh-bot-host.service",
    arguments: &["serve-app"],
    log: "host.log",
};

/// Start a `service run` supervisor: `dsh-bot` keeps its own unit running on Windows.
pub fn supervise(vars: &[(&str, String)]) -> Result<()> {
    dsh_bot_service::supervise(&UNIT, vars)
}

/// Bound the log a supervised run appends to.
pub fn trim_log() {
    dsh_bot_service::trim_log();
}

/// Install, uninstall, and status for the CLI's own `service` verb.
pub fn install(vars: &[(&str, String)]) -> Result<dsh_bot_service::Status> {
    dsh_bot_service::install(&UNIT, vars).map_err(|error| error.to_string())
}

pub fn uninstall() -> Result<bool> {
    dsh_bot_service::uninstall(&UNIT).map_err(|error| error.to_string())
}

pub fn status() -> dsh_bot_service::Status {
    dsh_bot_service::status(&UNIT)
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
        if Some(&self.config.root) != dsh_bot_service::home_dir().map(|home| home.join(".dsh-bot")).as_ref() {
            vars.push(("DSH_BOT_HOME", self.config.root.to_string_lossy().to_string()));
        }
        if self.config.port != crate::DEFAULT_PORT {
            vars.push(("DSH_BOT_HOST_PORT", self.config.port.to_string()));
        }
        vars
    }

    pub fn snapshot(&self) -> RegistrationSnapshot {
        let host = self.unit();
        let mut snapshot = RegistrationSnapshot::from_phases(host.phase, RegistrationPhase::NotRegistered);
        snapshot.host = host;
        snapshot
    }

    pub fn enable(&self) -> Result<UnitRegistration> {
        dsh_bot_service::install(&UNIT, &self.variables()).map_err(|error| error.to_string())?;
        Ok(self.unit())
    }

    pub fn stop(&self) -> Result<UnitRegistration> {
        dsh_bot_service::uninstall(&UNIT).map_err(|error| error.to_string())?;
        Ok(self.unit())
    }

    fn unit(&self) -> UnitRegistration {
        unit_registration(dsh_bot_service::status(&UNIT))
    }
}

/// A registered service that is not running yet waits on the OS, not on the user.
fn unit_registration(status: ServiceStatus) -> UnitRegistration {
    if status.running.is_some() {
        return UnitRegistration::new(ServiceUnit::Host, RegistrationPhase::Registered);
    }
    if status.installed {
        return UnitRegistration::with_reason(
            ServiceUnit::Host,
            RegistrationPhase::PendingApproval,
            format!("已登记，等待启动（{}）", status.log),
        );
    }
    UnitRegistration::with_reason(
        ServiceUnit::Host,
        RegistrationPhase::NotRegistered,
        "Host 尚未向系统登记",
    )
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
    fn the_snapshot_names_only_this_unit_and_leaves_the_relay_unregistered() {
        let dir = tempfile::tempdir().expect("tempdir");
        let snapshot = Registration::from_config(&config(dir.path().to_path_buf())).snapshot();
        assert_eq!(snapshot.host.unit, ServiceUnit::Host);
        assert_eq!(snapshot.relay.phase, RegistrationPhase::NotRegistered);
        assert_eq!(snapshot.version, dsh_bot_service::CONTRACT_VERSION);
    }

    #[test]
    fn a_service_that_runs_is_registered_and_one_waiting_is_pending() {
        let running = unit_registration(ServiceStatus {
            installed: true,
            running: Some(42),
            log: "host.log".into(),
        });
        assert_eq!(running.phase, RegistrationPhase::Registered);
        let waiting = unit_registration(ServiceStatus {
            installed: true,
            running: None,
            log: "host.log".into(),
        });
        assert_eq!(waiting.phase, RegistrationPhase::PendingApproval);
        let missing = unit_registration(ServiceStatus {
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
