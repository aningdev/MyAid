//! Registration vocabulary and snapshot shapes shared by HostControl and RelayControl.

use serde::{Deserialize, Serialize};

pub const CONTRACT_VERSION: u32 = 1;

/// One of the two peer Background Service units.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceUnit {
    Host,
    Relay,
}

/// OS registration fact for a single unit (platform-agnostic product phases).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RegistrationPhase {
    NotRegistered,
    PendingApproval,
    Registered,
    Denied,
    Failed,
}

impl RegistrationPhase {
    /// Unit is registered with the OS and may run detached from UI.
    pub fn is_registered_with_os(self) -> bool {
        matches!(self, Self::Registered)
    }
}

/// Shared control-channel verbs for registration query / user-enable / stop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationOperation {
    Query,
    Enable,
    Stop,
}

impl RegistrationOperation {
    pub const fn wire_name(self) -> &'static str {
        match self {
            Self::Query => "registrationQuery",
            Self::Enable => "registrationEnable",
            Self::Stop => "registrationStop",
        }
    }

    pub fn parse(operation: &str) -> Option<Self> {
        match operation {
            "registrationQuery" => Some(Self::Query),
            "registrationEnable" => Some(Self::Enable),
            "registrationStop" => Some(Self::Stop),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitRegistration {
    pub unit: ServiceUnit,
    pub phase: RegistrationPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl UnitRegistration {
    pub fn new(unit: ServiceUnit, phase: RegistrationPhase) -> Self {
        Self {
            unit,
            phase,
            reason: None,
        }
    }

    pub fn with_reason(
        unit: ServiceUnit,
        phase: RegistrationPhase,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            unit,
            phase,
            reason: Some(reason.into()),
        }
    }
}

/// Product Background availability derived from both units (ADR-0002 half-enabled).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundAvailability {
    Off,
    Degraded,
    Full,
}

/// Unit has left the pristine `notRegistered` state (enable in flight, blocked, or registered).
fn unit_affects_background_availability(phase: RegistrationPhase) -> bool {
    !matches!(phase, RegistrationPhase::NotRegistered)
}

pub fn background_availability(
    host: RegistrationPhase,
    relay: RegistrationPhase,
) -> BackgroundAvailability {
    if host.is_registered_with_os() && relay.is_registered_with_os() {
        return BackgroundAvailability::Full;
    }
    let host_active = unit_affects_background_availability(host);
    let relay_active = unit_affects_background_availability(relay);
    if !host_active && !relay_active {
        return BackgroundAvailability::Off;
    }
    BackgroundAvailability::Degraded
}

/// Dual-unit registration query payload for Client orchestration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationSnapshot {
    pub version: u32,
    pub host: UnitRegistration,
    pub relay: UnitRegistration,
    pub availability: BackgroundAvailability,
}

impl RegistrationSnapshot {
    pub fn from_phases(host: RegistrationPhase, relay: RegistrationPhase) -> Self {
        Self {
            version: CONTRACT_VERSION,
            host: UnitRegistration::new(ServiceUnit::Host, host),
            relay: UnitRegistration::new(ServiceUnit::Relay, relay),
            availability: background_availability(host, relay),
        }
    }
}
