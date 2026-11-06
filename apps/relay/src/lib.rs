//! Encrypted frame relay (empty shell).

pub use myaid_background_service as background_service;

#[derive(Debug, Default, Clone)]
pub struct Relay;

impl Relay {
    pub fn shell_name(&self) -> &'static str {
        "myaid-relay"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity() {
        assert_eq!(Relay.shell_name(), "myaid-relay");
    }

    #[test]
    fn relay_links_shared_registration_contract() {
        use background_service::{RegistrationOperation, ServiceUnit};
        assert_eq!(ServiceUnit::Relay, ServiceUnit::Relay);
        assert_eq!(
            RegistrationOperation::Stop.wire_name(),
            "registrationStop"
        );
    }
}
