//! Platform adapters for Host OS registration facts.

use myaid_background_service::UnitRegistration;

#[cfg(any(windows, test))]
mod windows_facts;

#[cfg(not(any(target_os = "macos", windows)))]
use myaid_background_service::{RegistrationPhase, ServiceUnit};

#[cfg(target_os = "macos")]
mod macos;

#[cfg(windows)]
mod windows;

pub fn query_host() -> UnitRegistration {
    query_host_impl()
}

pub fn enable_host() -> Result<UnitRegistration, String> {
    enable_host_impl()
}

pub fn stop_host() -> Result<UnitRegistration, String> {
    stop_host_impl()
}

#[cfg(target_os = "macos")]
fn query_host_impl() -> UnitRegistration {
    macos::query_host()
}

#[cfg(windows)]
fn query_host_impl() -> UnitRegistration {
    windows::query_host()
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
fn query_host_impl() -> UnitRegistration {
    UnitRegistration::new(ServiceUnit::Host, RegistrationPhase::NotRegistered)
}

#[cfg(target_os = "macos")]
fn enable_host_impl() -> Result<UnitRegistration, String> {
    macos::enable_host()
}

#[cfg(windows)]
fn enable_host_impl() -> Result<UnitRegistration, String> {
    windows::enable_host()
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
fn enable_host_impl() -> Result<UnitRegistration, String> {
    Err("当前平台尚未支持 Host 系统登记".into())
}

#[cfg(target_os = "macos")]
fn stop_host_impl() -> Result<UnitRegistration, String> {
    macos::stop_host()
}

#[cfg(windows)]
fn stop_host_impl() -> Result<UnitRegistration, String> {
    windows::stop_host()
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
fn stop_host_impl() -> Result<UnitRegistration, String> {
    Ok(UnitRegistration::new(
        ServiceUnit::Host,
        RegistrationPhase::NotRegistered,
    ))
}

#[cfg(all(test, not(any(windows, target_os = "macos"))))]
mod non_windows_stub_tests {
    use super::*;
    use myaid_background_service::{RegistrationPhase, ServiceUnit};

    #[test]
    fn non_macos_non_windows_stub_reports_not_registered_and_rejects_enable() {
        let unit = query_host();
        assert_eq!(unit.unit, ServiceUnit::Host);
        assert_eq!(unit.phase, RegistrationPhase::NotRegistered);
        assert!(enable_host().is_err());
        let stopped = stop_host().expect("stop is idempotent");
        assert_eq!(stopped.phase, RegistrationPhase::NotRegistered);
    }
}
