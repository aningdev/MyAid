//! The OS launch plan of each unit, snapshotted: the same plan an install would write, never
//! installed here. Nothing in this file touches launchd, systemd, or the registry.

use std::path::Path;

use myaid_service::{RegistrationPhase, RegistrationSnapshot, ServiceUnit, Unit};

const HOST: Unit = Unit {
    label: "com.myaid.host",
    systemd_unit: "myaid-host.service",
    arguments: &["serve-app"],
    log: "host.log",
};

const RELAY: Unit = Unit {
    label: "com.myaid.relay",
    systemd_unit: "myaid-relay.service",
    arguments: &["serve-app"],
    log: "relay.log",
};

fn vars() -> Vec<(&'static str, String)> {
    vec![
        ("MYAID_DATA_ROOT", "/Users/ana/.myaid".to_string()),
        ("MYAID_HOST_PORT", "4872".to_string()),
    ]
}

#[test]
fn launchd_plist_names_the_unit_and_keeps_it_running() {
    let plist = HOST.launchd_plist(
        Path::new("/Applications/MyAid.app/Contents/MacOS/myaid-host"),
        &vars(),
        Path::new("/Users/ana/Library/Logs/MyAid/host.log"),
    );
    assert_eq!(
        plist,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.myaid.host</string>
	<key>ProgramArguments</key>
	<array>
		<string>/Applications/MyAid.app/Contents/MacOS/myaid-host</string>
		<string>serve-app</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>MYAID_SERVICE</key>
		<string>1</string>
		<key>MYAID_DATA_ROOT</key>
		<string>/Users/ana/.myaid</string>
		<key>MYAID_HOST_PORT</key>
		<string>4872</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>/Users/ana/Library/Logs/MyAid/host.log</string>
	<key>StandardErrorPath</key>
	<string>/Users/ana/Library/Logs/MyAid/host.log</string>
</dict>
</plist>
"#
    );
}

#[test]
fn systemd_user_unit_runs_the_unit_with_its_variables() {
    let unit = RELAY.systemd_unit(Path::new("/usr/local/bin/myaid-relay"), &vars());
    assert_eq!(
        unit,
        "[Unit]\nDescription=MyAid: this computer's com.myaid.relay background service\n\n[Service]\nExecStart=\"/usr/local/bin/myaid-relay\" \"serve-app\"\nEnvironment=MYAID_SERVICE=1\nEnvironment=\"MYAID_DATA_ROOT=/Users/ana/.myaid\"\nEnvironment=\"MYAID_HOST_PORT=4872\"\nRestart=always\nRestartSec=2\n\n[Install]\nWantedBy=default.target\n"
    );
}

#[test]
fn windows_run_value_starts_the_supervisor_with_the_installing_variables() {
    let command = HOST.windows_run_command(
        Path::new(r"C:\Users\ana\AppData\Local\MyAid\myaid-host.exe"),
        &vars(),
    );
    assert_eq!(
        command,
        r#""C:\Users\ana\AppData\Local\MyAid\myaid-host.exe" service run --env "MYAID_DATA_ROOT=/Users/ana/.myaid" --env "MYAID_HOST_PORT=4872""#
    );
    assert_eq!(
        HOST.windows_supervisor_command(Path::new(r"C:\MyAid\myaid-host.exe")),
        r"C:\MyAid\myaid-host.exe serve-app"
    );
}

#[test]
fn a_plist_escapes_the_values_it_carries() {
    let plist = HOST.launchd_plist(
        Path::new("/tmp/a&b"),
        &[("MYAID_DATA_ROOT", "/tmp/<root>".to_string())],
        Path::new("/tmp/log"),
    );
    assert!(plist.contains("<string>/tmp/a&amp;b</string>"));
    assert!(plist.contains("<string>/tmp/&lt;root&gt;</string>"));
}

#[test]
fn host_and_relay_units_share_one_plan_shape_and_differ_in_their_names() {
    assert_ne!(HOST.label, RELAY.label);
    assert_ne!(HOST.systemd_unit, RELAY.systemd_unit);
    assert_eq!(HOST.arguments, RELAY.arguments);
}

#[test]
fn a_snapshot_names_both_units_with_the_contract_version() {
    let snapshot = RegistrationSnapshot::from_phases(
        RegistrationPhase::Registered,
        RegistrationPhase::NotRegistered,
    );
    assert_eq!(snapshot.host.unit, ServiceUnit::Host);
    assert_eq!(snapshot.relay.unit, ServiceUnit::Relay);
    assert_eq!(snapshot.version, 1);
}
