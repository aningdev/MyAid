//! Windows Run-key + StartupApproved facts for Host background registration.
//!
//! Mechanism: per-user `Run` value pointing at the Host executable (logon auto-start).
//! `StartupApproved\Run` reflects user/policy disable in Settings → Apps → Startup.
//!
//! Gaps (honest): no Task Scheduler / Windows Service integration yet; MSIX StartupTask
//! deferred until NSH Windows packaging lands. Elevation or machine-wide install is out of scope.

use myaid_background_service::{RegistrationPhase, ServiceUnit, UnitRegistration};
use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE, KEY_WRITE};
use winreg::RegKey;

use super::windows_facts::{
    map_host_run_fact, unit_from_phase, WindowsRunFact, HOST_RUN_VALUE_NAME, StartupApproval,
};

const RUN_KEY_PATH: &str = super::windows_facts::RUN_KEY_PATH_FOR_DOCS;
const STARTUP_APPROVED_RUN_PATH: &str = super::windows_facts::STARTUP_APPROVED_RUN_PATH_FOR_DOCS;

pub fn query_host() -> UnitRegistration {
    let fact = match read_run_fact(HOST_RUN_VALUE_NAME) {
        Ok(fact) => fact,
        Err(error) => {
            return UnitRegistration::with_reason(
                ServiceUnit::Host,
                RegistrationPhase::Failed,
                format!("读取 Host 登记状态失败: {error}"),
            );
        }
    };
    let (phase, reason) = map_host_run_fact(fact);
    unit_from_phase(ServiceUnit::Host, phase, reason)
}

pub fn enable_host() -> Result<UnitRegistration, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("无法解析 Host 可执行路径: {error}"))?;
    let exe = exe.to_string_lossy().into_owned();
    write_run_value(HOST_RUN_VALUE_NAME, &exe)?;
    Ok(query_host())
}

pub fn stop_host() -> Result<UnitRegistration, String> {
    delete_run_value(HOST_RUN_VALUE_NAME)?;
    Ok(query_host())
}

fn read_run_fact(value_name: &str) -> Result<WindowsRunFact, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run = hkcu
        .open_subkey(RUN_KEY_PATH)
        .map_err(|error| error.to_string())?;
    let run_command = match run.get_value::<String, _>(value_name) {
        Ok(command) => Some(command),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    let startup_approval = read_startup_approval(value_name).unwrap_or(None);
    Ok(WindowsRunFact {
        run_command,
        startup_approval,
    })
}

fn read_startup_approval(value_name: &str) -> Result<Option<StartupApproval>, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let approved = match hkcu.open_subkey(STARTUP_APPROVED_RUN_PATH) {
        Ok(key) => key,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let raw = match approved.get_raw_value(value_name) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    Ok(Some(parse_startup_approved(&raw.bytes)))
}

pub fn parse_startup_approved(bytes: &[u8]) -> StartupApproval {
    if bytes.is_empty() {
        return StartupApproval::Unknown;
    }
    match bytes[0] {
        0x02 => StartupApproval::DisabledByUser,
        0x03 => StartupApproval::Enabled,
        0x06 | 0x07 => StartupApproval::DisabledByPolicy,
        _ => StartupApproval::Unknown,
    }
}

fn write_run_value(name: &str, command: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run, _) = hkcu
        .create_subkey(RUN_KEY_PATH)
        .map_err(|error| error.to_string())?;
    run.set_value(name, &command)
        .map_err(|error| error.to_string())
}

fn delete_run_value(name: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run = hkcu
        .open_subkey_with_flags(RUN_KEY_PATH, KEY_WRITE | KEY_SET_VALUE)
        .map_err(|error| error.to_string())?;
    match run.delete_value(name) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_approved_bytes_map_to_approval_enum() {
        assert_eq!(
            parse_startup_approved(&[0x03, 0x00, 0x00, 0x00]),
            StartupApproval::Enabled
        );
        assert_eq!(
            parse_startup_approved(&[0x02, 0x00]),
            StartupApproval::DisabledByUser
        );
        assert_eq!(
            parse_startup_approved(&[0x06]),
            StartupApproval::DisabledByPolicy
        );
    }
}
