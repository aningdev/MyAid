//! macOS ServiceManagement facts for the Host LaunchAgent plist.

use myaid_background_service::{RegistrationPhase, ServiceUnit, UnitRegistration};
use objc2_foundation::NSString;
use objc2_service_management::{SMAppService, SMAppServiceStatus};

/// LaunchAgent plist name inside a signed app bundle (`Contents/Library/LaunchAgents/`).
pub const HOST_AGENT_PLIST: &str = "com.myaid.host.plist";

pub fn map_smapp_status(status: SMAppServiceStatus) -> (RegistrationPhase, Option<&'static str>) {
    if status == SMAppServiceStatus::NotRegistered {
        (
            RegistrationPhase::NotRegistered,
            Some("Host 辅助程序尚未向系统登记"),
        )
    } else if status == SMAppServiceStatus::Enabled {
        (RegistrationPhase::Registered, None)
    } else if status == SMAppServiceStatus::RequiresApproval {
        (
            RegistrationPhase::PendingApproval,
            Some("需在系统设置中批准 Host 后台运行"),
        )
    } else if status == SMAppServiceStatus::NotFound {
        (
            RegistrationPhase::Failed,
            Some("未在 App 包内找到 Host 辅助程序配置（需签名成品）"),
        )
    } else {
        (
            RegistrationPhase::Failed,
            Some("未知的 Host 登记状态"),
        )
    }
}

fn host_service() -> objc2::rc::Retained<SMAppService> {
    let name = NSString::from_str(HOST_AGENT_PLIST);
    unsafe { SMAppService::agentServiceWithPlistName(&name) }
}

pub fn query_host() -> UnitRegistration {
    let service = host_service();
    let status = unsafe { service.status() };
    let (phase, reason) = map_smapp_status(status);
    unit_from_phase(phase, reason)
}

pub fn enable_host() -> Result<UnitRegistration, String> {
    let service = host_service();
    match unsafe { service.registerAndReturnError() } {
        Ok(()) => Ok(query_host()),
        Err(error) => Err(registration_error(&error)),
    }
}

pub fn stop_host() -> Result<UnitRegistration, String> {
    let service = host_service();
    match unsafe { service.unregisterAndReturnError() } {
        Ok(()) => Ok(query_host()),
        Err(error) => Err(registration_error(&error)),
    }
}

fn unit_from_phase(phase: RegistrationPhase, reason: Option<&str>) -> UnitRegistration {
    match reason {
        Some(text) => UnitRegistration::with_reason(ServiceUnit::Host, phase, text),
        None => UnitRegistration::new(ServiceUnit::Host, phase),
    }
}

fn registration_error(error: &objc2_foundation::NSError) -> String {
    error
        .localizedDescription()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smapp_status_maps_to_product_phases() {
        let (phase, _) = map_smapp_status(SMAppServiceStatus::NotRegistered);
        assert_eq!(phase, RegistrationPhase::NotRegistered);
        let (phase, _) = map_smapp_status(SMAppServiceStatus::RequiresApproval);
        assert_eq!(phase, RegistrationPhase::PendingApproval);
        let (phase, _) = map_smapp_status(SMAppServiceStatus::Enabled);
        assert_eq!(phase, RegistrationPhase::Registered);
        let (phase, reason) = map_smapp_status(SMAppServiceStatus::NotFound);
        assert_eq!(phase, RegistrationPhase::Failed);
        assert!(reason.unwrap().contains("签名"));
    }
}
