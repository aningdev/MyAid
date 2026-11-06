//! Public contract seams: status vocabulary, control verbs, product availability.

use myaid_background_service::{
    BackgroundAvailability, RegistrationOperation, RegistrationPhase, RegistrationSnapshot,
    ServiceUnit, UnitRegistration,
};

#[test]
fn registration_phase_uses_stable_wire_tokens() {
    assert_eq!(
        serde_json::to_string(&RegistrationPhase::NotRegistered).unwrap(),
        "\"notRegistered\""
    );
    assert_eq!(
        serde_json::to_string(&RegistrationPhase::PendingApproval).unwrap(),
        "\"pendingApproval\""
    );
    assert_eq!(
        serde_json::to_string(&RegistrationPhase::Registered).unwrap(),
        "\"registered\""
    );
    assert_eq!(
        serde_json::to_string(&RegistrationPhase::Denied).unwrap(),
        "\"denied\""
    );
    assert_eq!(
        serde_json::to_string(&RegistrationPhase::Failed).unwrap(),
        "\"failed\""
    );
}

#[test]
fn registration_operations_share_query_enable_stop_verbs() {
    assert_eq!(
        RegistrationOperation::Query.wire_name(),
        "registrationQuery"
    );
    assert_eq!(
        RegistrationOperation::Enable.wire_name(),
        "registrationEnable"
    );
    assert_eq!(
        RegistrationOperation::Stop.wire_name(),
        "registrationStop"
    );
    assert_eq!(
        RegistrationOperation::parse("registrationEnable"),
        Some(RegistrationOperation::Enable)
    );
}

#[test]
fn half_enabled_background_is_degraded_not_off() {
    let snapshot = RegistrationSnapshot::from_phases(
        RegistrationPhase::Registered,
        RegistrationPhase::NotRegistered,
    );
    assert_eq!(snapshot.availability, BackgroundAvailability::Degraded);
    assert_eq!(snapshot.host.phase, RegistrationPhase::Registered);
    assert_eq!(snapshot.relay.phase, RegistrationPhase::NotRegistered);
}

#[test]
fn pending_on_one_unit_with_other_not_registered_is_degraded() {
    let snapshot = RegistrationSnapshot::from_phases(
        RegistrationPhase::PendingApproval,
        RegistrationPhase::NotRegistered,
    );
    assert_eq!(snapshot.availability, BackgroundAvailability::Degraded);
}

#[test]
fn unit_registration_carries_optional_reason_for_denied_or_failed() {
    let unit = UnitRegistration {
        unit: ServiceUnit::Relay,
        phase: RegistrationPhase::Denied,
        reason: Some("User declined login item".into()),
    };
    let json = serde_json::to_string(&unit).unwrap();
    assert!(json.contains("\"denied\""));
    assert!(json.contains("User declined login item"));
}
