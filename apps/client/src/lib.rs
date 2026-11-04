//! Native adapters for the NSH client. Empty shell — no adapters yet.

/// Placeholder so the crate type-checks in the Cargo workspace.
pub fn shell_name() -> &'static str {
    "myaid-client"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity() {
        assert_eq!(shell_name(), "myaid-client");
    }
}
