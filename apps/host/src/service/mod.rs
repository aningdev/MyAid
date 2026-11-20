//! Host OS registration: the launch plan, the OS verbs, and the snapshot the control API serves.

mod install;
mod plan;
mod registration;

pub use install::{install, status, supervise, trim_log, uninstall};
pub use plan::{
    LABEL, Status, launchd_plist, systemd_unit, windows_run_command, windows_supervisor_command,
};
pub use registration::{Registration, RegistrationPhase, RegistrationSnapshot};
