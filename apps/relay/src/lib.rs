//! Encrypted frame relay shell with local RelayControl.

mod background_registration;
mod config;
pub mod relay_control;
mod runtime;

pub use background_registration::RelayRegistration;
pub use config::Config;
pub type Result<T> = std::result::Result<T, String>;
pub use relay_control::{
    MAX_FRAME, PROTOCOL, Request, Status, assert_public_status, call, decode_response,
    default_endpoint, read_frame, serve,
};
pub use relay_control::transport::LocalStream;
pub use runtime::{generation, home_dir, private_dir, private_file};

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
    use std::{
        sync::atomic::{AtomicBool, Ordering},
        thread,
        time::Duration,
    };

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

    #[test]
    fn serve_keeps_running_until_exit() {
        let dir = tempfile::tempdir().expect("tempdir");
        let data_root = dir.path().join("data");
        let socket = dir.path().join("control.sock");
        let config = Config::from_args(&[
            "--data-root".into(),
            data_root.to_string_lossy().into(),
            "--control-socket".into(),
            socket.to_string_lossy().into(),
        ])
        .expect("config");
        let exit: &'static AtomicBool = Box::leak(Box::new(AtomicBool::new(false)));
        let exit_for_serve = exit;
        let handle = thread::spawn(move || serve(config, exit_for_serve));
        thread::sleep(Duration::from_millis(100));
        assert!(
            !handle.is_finished(),
            "serve should stay alive until exit is requested"
        );
        exit.store(true, Ordering::Release);
        handle.join().expect("join").expect("serve");
    }
}
