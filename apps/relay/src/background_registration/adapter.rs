//! Platform adapters for Relay OS registration facts.

use myaid_background_service::UnitRegistration;

#[cfg(any(windows, test))]
mod windows_facts;

#[cfg(not(any(target_os = "macos", windows)))]
use myaid_background_service::{RegistrationPhase, ServiceUnit};

#[cfg(target_os = "macos")]
mod macos;

#[cfg(windows)]
mod windows;

pub fn query_relay() -> UnitRegistration {
    query_relay_impl()
}

pub fn enable_relay() -> Result<UnitRegistration, String> {
    enable_relay_impl()
}

pub fn stop_relay() -> Result<UnitRegistration, String> {
    stop_relay_impl()
}

#[cfg(target_os = "macos")]
fn query_relay_impl() -> UnitRegistration {
    macos::query_relay()
}

#[cfg(windows)]
fn query_relay_impl() -> UnitRegistration {
    windows::query_relay()
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
fn query_relay_impl() -> UnitRegistration {
    UnitRegistration::new(ServiceUnit::Relay, RegistrationPhase::NotRegistered)
}

#[cfg(target_os = "macos")]
fn enable_relay_impl() -> Result<UnitRegistration, String> {
    macos::enable_relay()
}

#[cfg(windows)]
fn enable_relay_impl() -> Result<UnitRegistration, String> {
    windows::enable_relay()
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
fn enable_relay_impl() -> Result<UnitRegistration, String> {
    Err("当前平台尚未支持 Relay 系统登记".into())
}

#[cfg(target_os = "macos")]
fn stop_relay_impl() -> Result<UnitRegistration, String> {
    macos::stop_relay()
}

#[cfg(windows)]
fn stop_relay_impl() -> Result<UnitRegistration, String> {
    windows::stop_relay()
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
fn stop_relay_impl() -> Result<UnitRegistration, String> {
    Ok(UnitRegistration::new(
        ServiceUnit::Relay,
        RegistrationPhase::NotRegistered,
    ))
}

#[cfg(all(test, not(any(windows, target_os = "macos"))))]
mod non_windows_stub_tests {
    use super::*;
    use myaid_background_service::{RegistrationPhase, ServiceUnit};

    #[test]
    fn non_macos_non_windows_stub_reports_not_registered_and_rejects_enable() {
        let unit = query_relay();
        assert_eq!(unit.unit, ServiceUnit::Relay);
        assert_eq!(unit.phase, RegistrationPhase::NotRegistered);
        assert!(enable_relay().is_err());
        let stopped = stop_relay().expect("stop is idempotent");
        assert_eq!(stopped.phase, RegistrationPhase::NotRegistered);
    }
}
