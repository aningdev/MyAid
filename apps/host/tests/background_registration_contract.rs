//! Host references the shared Background Service registration contract.

use myaid_background_service::{RegistrationOperation, RegistrationPhase};

#[test]
fn host_links_shared_registration_contract() {
    assert_eq!(
        RegistrationOperation::Query.wire_name(),
        "registrationQuery"
    );
    assert!(!RegistrationPhase::NotRegistered.is_registered_with_os());
}
