//! Pure Windows Run-key registration facts → shared product phases (testable on any host).

use myaid_background_service::{RegistrationPhase, ServiceUnit, UnitRegistration};

/// Value name under `HKCU\...\Run` for the Relay background unit (pairs with macOS plist id).
pub const RELAY_RUN_VALUE_NAME: &str = "com.myaid.relay";

const RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const STARTUP_APPROVED_RUN_PATH: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

pub const RUN_KEY_PATH_FOR_DOCS: &str = RUN_KEY_PATH;
pub const STARTUP_APPROVED_RUN_PATH_FOR_DOCS: &str = STARTUP_APPROVED_RUN_PATH;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupApproval {
    Enabled,
    DisabledByUser,
    DisabledByPolicy,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowsRunFact {
    pub run_command: Option<String>,
    pub startup_approval: Option<StartupApproval>,
}

pub fn map_relay_run_fact(fact: WindowsRunFact) -> (RegistrationPhase, Option<&'static str>) {
    map_run_fact(
        fact,
        "Relay 后台尚未向系统登记（当前用户启动项）",
        "需在 Windows 设置中启用 Relay 启动项",
        "Relay 启动项被策略禁用",
    )
}

pub fn unit_from_phase(
    unit: ServiceUnit,
    phase: RegistrationPhase,
    reason: Option<&str>,
) -> UnitRegistration {
    match reason {
        Some(text) => UnitRegistration::with_reason(unit, phase, text),
        None => UnitRegistration::new(unit, phase),
    }
}

fn map_run_fact(
    fact: WindowsRunFact,
    not_registered: &'static str,
    pending: &'static str,
    denied: &'static str,
) -> (RegistrationPhase, Option<&'static str>) {
    if fact.run_command.is_none() {
        return (RegistrationPhase::NotRegistered, Some(not_registered));
    }

    match fact.startup_approval {
        Some(StartupApproval::DisabledByUser) => {
            (RegistrationPhase::PendingApproval, Some(pending))
        }
        Some(StartupApproval::DisabledByPolicy) => (RegistrationPhase::Denied, Some(denied)),
        Some(StartupApproval::Enabled) | Some(StartupApproval::Unknown) | None => {
            (RegistrationPhase::Registered, None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_run_entry_is_not_registered() {
        let (phase, reason) = map_relay_run_fact(WindowsRunFact {
            run_command: None,
            startup_approval: None,
        });
        assert_eq!(phase, RegistrationPhase::NotRegistered);
        assert!(reason.unwrap().contains("Relay"));
    }

    #[test]
    fn run_entry_without_approval_fact_is_registered() {
        let (phase, reason) = map_relay_run_fact(WindowsRunFact {
            run_command: Some(r"C:\Program Files\MyAid\myaid-relay.exe".into()),
            startup_approval: None,
        });
        assert_eq!(phase, RegistrationPhase::Registered);
        assert!(reason.is_none());
    }

    #[test]
    fn user_disabled_startup_maps_to_pending_approval() {
        let (phase, reason) = map_relay_run_fact(WindowsRunFact {
            run_command: Some("myaid-relay.exe".into()),
            startup_approval: Some(StartupApproval::DisabledByUser),
        });
        assert_eq!(phase, RegistrationPhase::PendingApproval);
        assert!(reason.unwrap().contains("Windows 设置"));
    }

    #[test]
    fn policy_disabled_startup_maps_to_denied() {
        let (phase, reason) = map_relay_run_fact(WindowsRunFact {
            run_command: Some("myaid-relay.exe".into()),
            startup_approval: Some(StartupApproval::DisabledByPolicy),
        });
        assert_eq!(phase, RegistrationPhase::Denied);
        assert!(reason.unwrap().contains("策略"));
    }
}
