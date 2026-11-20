//! Relay unit OS registration: the shared launch plan, named for this unit.
//!
//! Same shape as the Host's: the Relay reports only its own unit's fact, and the Client merges
//! the two snapshots. The unit runs `serve-app`, which is the resident forwarding process.

use crate::{Config, Result};
use dsh_bot_service::{
    RegistrationPhase, RegistrationSnapshot, ServiceUnit, Status as ServiceStatus, Unit,
    UnitRegistration,
};

/// The Relay's Background Service unit: `serve-app` at login, logging beside its own data.
pub const UNIT: Unit = Unit {
    label: "com.aningdev.dshbot.relay",
    systemd_unit: "dsh-bot-relay.service",
    arguments: &["serve-app"],
    log: "relay.log",
};

/// Start a `service run` supervisor: the OS keeps the unit running here.
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

    pub fn snapshot(&self) -> RegistrationSnapshot {
        let relay = self.unit();
        let mut snapshot =
            RegistrationSnapshot::from_phases(RegistrationPhase::NotRegistered, relay.phase);
        snapshot.relay = relay;
        snapshot
    }

    pub fn enable(&self) -> Result<UnitRegistration> {
        dsh_bot_service::install(&UNIT, &self.config.variables())
            .map_err(|error| error.to_string())?;
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
        return UnitRegistration::new(ServiceUnit::Relay, RegistrationPhase::Registered);
    }
    if status.installed {
        return UnitRegistration::with_reason(
            ServiceUnit::Relay,
            RegistrationPhase::PendingApproval,
            format!("已登记，等待启动（{}）", status.log),
        );
    }
    UnitRegistration::with_reason(
        ServiceUnit::Relay,
        RegistrationPhase::NotRegistered,
        "Relay 尚未向系统登记",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(root: std::path::PathBuf) -> Config {
        let config = Config::from_args(&[
            "--data-root".into(),
            root.to_string_lossy().into(),
            "--version".into(),
            "test-version".into(),
        ])
        .expect("config");
        config
    }

    #[test]
    fn the_snapshot_names_only_this_unit_and_leaves_the_host_unregistered() {
        let dir = tempfile::tempdir().expect("tempdir");
        let snapshot = Registration::from_config(&config(dir.path().to_path_buf())).snapshot();
        assert_eq!(snapshot.relay.unit, ServiceUnit::Relay);
        assert_eq!(snapshot.host.phase, RegistrationPhase::NotRegistered);
        assert_eq!(snapshot.version, dsh_bot_service::CONTRACT_VERSION);
    }

    #[test]
    fn a_scratch_data_root_and_another_port_are_passed_to_the_service() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut config = config(dir.path().to_path_buf());
        config.port = 4999;
        let vars = config.variables();
        assert!(vars.contains(&("DSH_BOT_RELAY_PORT", "4999".to_string())));
        assert!(vars.iter().any(|(name, _)| *name == "DSH_BOT_HOME"));
    }
}
