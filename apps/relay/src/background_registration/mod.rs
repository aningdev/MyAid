//! Relay unit OS registration facts (thin adapter over ServiceManagement on macOS).

mod adapter;

use crate::Config;
use myaid_background_service::{
    RegistrationPhase, RegistrationSnapshot, ServiceUnit, UnitRegistration,
};

/// Relay Background Service registration control (query / user-enable / stop).
#[derive(Clone)]
pub struct RelayRegistration {
    explicit_dev: bool,
}

impl RelayRegistration {
    pub fn from_config(config: &Config) -> Self {
        Self {
            explicit_dev: config.explicit_dev_relay,
        }
    }

    pub fn query_snapshot(&self) -> RegistrationSnapshot {
        let relay = self.query_relay();
        let mut snapshot =
            RegistrationSnapshot::from_phases(RegistrationPhase::NotRegistered, relay.phase);
        snapshot.relay = relay;
        snapshot
    }

    pub fn enable(&self) -> Result<UnitRegistration, String> {
        if self.explicit_dev {
            return Err("开发态显式 Relay 无法向系统登记".into());
        }
        adapter::enable_relay()
    }

    pub fn stop(&self) -> Result<UnitRegistration, String> {
        if self.explicit_dev {
            return Ok(dev_not_registered());
        }
        adapter::stop_relay()
    }

    fn query_relay(&self) -> UnitRegistration {
        if self.explicit_dev {
            return dev_not_registered();
        }
        adapter::query_relay()
    }
}

fn dev_not_registered() -> UnitRegistration {
    UnitRegistration::with_reason(
        ServiceUnit::Relay,
        RegistrationPhase::NotRegistered,
        "开发态显式 Relay，未向系统登记",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dev_config(root: PathBuf) -> Config {
        Config::from_args(&[
            "--data-root".into(),
            root.to_string_lossy().into(),
            "--version".into(),
            "test-version".into(),
        ])
        .expect("config")
    }

    #[test]
    fn dev_explicit_query_reports_not_registered_relay() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = dev_config(dir.path().to_path_buf());
        let registration = RelayRegistration::from_config(&config);
        let snapshot = registration.query_snapshot();
        assert_eq!(snapshot.relay.phase, RegistrationPhase::NotRegistered);
        assert_eq!(snapshot.host.phase, RegistrationPhase::NotRegistered);
        assert!(snapshot.relay.reason.as_deref().unwrap().contains("开发态"));
    }

    #[test]
    fn dev_explicit_enable_is_rejected_without_affecting_query() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = dev_config(dir.path().to_path_buf());
        let registration = RelayRegistration::from_config(&config);
        assert!(registration.enable().is_err());
        assert_eq!(
            registration.query_snapshot().relay.phase,
            RegistrationPhase::NotRegistered
        );
    }
}
