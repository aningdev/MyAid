//! Host unit OS registration facts (thin adapter over ServiceManagement on macOS).

mod adapter;

use crate::Config;
use myaid_background_service::{
    RegistrationPhase, RegistrationSnapshot, ServiceUnit, UnitRegistration,
};

/// Host Background Service registration control (query / user-enable / stop).
#[derive(Clone)]
pub struct HostRegistration {
    explicit_dev: bool,
}

impl HostRegistration {
    pub fn from_config(config: &Config) -> Self {
        Self {
            explicit_dev: config.explicit_dev_host,
        }
    }

    pub fn query_snapshot(&self) -> RegistrationSnapshot {
        let host = self.query_host();
        let mut snapshot =
            RegistrationSnapshot::from_phases(host.phase, RegistrationPhase::NotRegistered);
        snapshot.host = host;
        snapshot
    }

    pub fn enable(&self) -> Result<UnitRegistration, String> {
        if self.explicit_dev {
            return Err("开发态显式 Host 无法向系统登记".into());
        }
        adapter::enable_host()
    }

    pub fn stop(&self) -> Result<UnitRegistration, String> {
        if self.explicit_dev {
            return Ok(dev_not_registered());
        }
        adapter::stop_host()
    }

    fn query_host(&self) -> UnitRegistration {
        if self.explicit_dev {
            return dev_not_registered();
        }
        adapter::query_host()
    }
}

fn dev_not_registered() -> UnitRegistration {
    UnitRegistration::with_reason(
        ServiceUnit::Host,
        RegistrationPhase::NotRegistered,
        "开发态显式 Host，未向系统登记",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CliSource, Config};
    use std::{path::PathBuf, time::Duration};

    fn dev_config(root: PathBuf) -> Config {
        Config {
            logs: root.join("logs"),
            root: root.clone(),
            cli: CliSource::Executable(root.join("fake-dsh")),
            version: "test-version".into(),
            startup_timeout: Duration::from_millis(400),
            explicit_dev_host: true,
        }
    }

    #[test]
    fn dev_explicit_query_reports_not_registered_host() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = dev_config(dir.path().to_path_buf());
        config.prepare().expect("prepare");
        let registration = HostRegistration::from_config(&config);
        let snapshot = registration.query_snapshot();
        assert_eq!(snapshot.host.phase, RegistrationPhase::NotRegistered);
        assert_eq!(snapshot.relay.phase, RegistrationPhase::NotRegistered);
        assert!(snapshot.host.reason.as_deref().unwrap().contains("开发态"));
    }

    #[test]
    fn dev_explicit_enable_is_rejected_without_affecting_query() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = dev_config(dir.path().to_path_buf());
        config.prepare().expect("prepare");
        let registration = HostRegistration::from_config(&config);
        assert!(registration.enable().is_err());
        assert_eq!(
            registration.query_snapshot().host.phase,
            RegistrationPhase::NotRegistered
        );
    }
}
