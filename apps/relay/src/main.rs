use myaid_relay::Relay;

fn main() {
    let relay = Relay::default();
    eprintln!(
        "{} empty shell — frame forwarding not implemented",
        relay.shell_name()
    );
}
