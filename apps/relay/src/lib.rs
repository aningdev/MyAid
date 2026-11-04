//! Encrypted frame relay (empty shell).

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
}
