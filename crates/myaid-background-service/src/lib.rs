//! Shared OS registration contract for Background Service units (Host ∥ Relay).
//!
//! Platform adapters implement facts; HostControl and RelayControl expose the same verbs.

mod registration;

pub use registration::{
    BackgroundAvailability, RegistrationOperation, RegistrationPhase, RegistrationSnapshot,
    ServiceUnit, UnitRegistration, CONTRACT_VERSION,
};
