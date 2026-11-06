//! Platform adapters for Relay OS registration facts.

use myaid_background_service::UnitRegistration;

#[cfg(not(target_os = "macos"))]
use myaid_background_service::{RegistrationPhase, ServiceUnit};

#[cfg(target_os = "macos")]
mod macos;

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

#[cfg(not(target_os = "macos"))]
fn query_relay_impl() -> UnitRegistration {
    UnitRegistration::new(ServiceUnit::Relay, RegistrationPhase::NotRegistered)
}

#[cfg(target_os = "macos")]
fn enable_relay_impl() -> Result<UnitRegistration, String> {
    macos::enable_relay()
}

#[cfg(not(target_os = "macos"))]
fn enable_relay_impl() -> Result<UnitRegistration, String> {
    Err("当前平台尚未支持 Relay 系统登记".into())
}

#[cfg(target_os = "macos")]
fn stop_relay_impl() -> Result<UnitRegistration, String> {
    macos::stop_relay()
}

#[cfg(not(target_os = "macos"))]
fn stop_relay_impl() -> Result<UnitRegistration, String> {
    Ok(UnitRegistration::new(
        ServiceUnit::Relay,
        RegistrationPhase::NotRegistered,
    ))
}
