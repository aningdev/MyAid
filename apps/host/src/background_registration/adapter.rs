//! Platform adapters for Host OS registration facts.

use myaid_background_service::UnitRegistration;

#[cfg(not(target_os = "macos"))]
use myaid_background_service::{RegistrationPhase, ServiceUnit};

#[cfg(target_os = "macos")]
mod macos;

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

#[cfg(not(target_os = "macos"))]
fn query_host_impl() -> UnitRegistration {
    UnitRegistration::new(ServiceUnit::Host, RegistrationPhase::NotRegistered)
}

#[cfg(target_os = "macos")]
fn enable_host_impl() -> Result<UnitRegistration, String> {
    macos::enable_host()
}

#[cfg(not(target_os = "macos"))]
fn enable_host_impl() -> Result<UnitRegistration, String> {
    Err("当前平台尚未支持 Host 系统登记".into())
}

#[cfg(target_os = "macos")]
fn stop_host_impl() -> Result<UnitRegistration, String> {
    macos::stop_host()
}

#[cfg(not(target_os = "macos"))]
fn stop_host_impl() -> Result<UnitRegistration, String> {
    Ok(UnitRegistration::new(
        ServiceUnit::Host,
        RegistrationPhase::NotRegistered,
    ))
}
