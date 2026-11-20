//! The Host's OS launch plan, snapshotted: the same plan an install would write, never installed
//! here. Nothing in this file touches launchd, systemd, or the registry.

use std::path::Path;

use dsh_bot_host::service::{
    launchd_plist, systemd_unit, windows_run_command, windows_supervisor_command,
};

fn vars() -> Vec<(&'static str, String)> {
    vec![
        ("DSH_BOT_HOME", "/Users/ana/.dsh-bot".to_string()),
        ("DSH_BOT_HOST_PORT", "4872".to_string()),
    ]
}

#[test]
fn launchd_plist_names_the_host_and_keeps_it_running() {
    let plist = launchd_plist(
        Path::new("/Applications/dsh-bot.app/Contents/MacOS/dsh-bot-host"),
        &vars(),
        Path::new("/Users/ana/Library/Logs/dsh-bot/host.log"),
    );
    assert_eq!(
        plist,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.aningdev.dshbot.host</string>
	<key>ProgramArguments</key>
	<array>
		<string>/Applications/dsh-bot.app/Contents/MacOS/dsh-bot-host</string>
		<string>serve-app</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>DSH_BOT_SERVICE</key>
		<string>1</string>
		<key>DSH_BOT_HOME</key>
		<string>/Users/ana/.dsh-bot</string>
		<key>DSH_BOT_HOST_PORT</key>
		<string>4872</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>/Users/ana/Library/Logs/dsh-bot/host.log</string>
	<key>StandardErrorPath</key>
	<string>/Users/ana/Library/Logs/dsh-bot/host.log</string>
</dict>
</plist>
"#
    );
}

#[test]
fn systemd_user_unit_runs_the_host_with_its_variables() {
    let unit = systemd_unit(Path::new("/usr/local/bin/dsh-bot-host"), &vars());
    assert_eq!(
        unit,
        "[Unit]\nDescription=dsh-bot: this computer's com.aningdev.dshbot.host background service\n\n[Service]\nExecStart=\"/usr/local/bin/dsh-bot-host\" \"serve-app\"\nEnvironment=DSH_BOT_SERVICE=1\nEnvironment=\"DSH_BOT_HOME=/Users/ana/.dsh-bot\"\nEnvironment=\"DSH_BOT_HOST_PORT=4872\"\nRestart=always\nRestartSec=2\n\n[Install]\nWantedBy=default.target\n"
    );
}

#[test]
fn windows_run_value_starts_the_supervisor_with_the_installing_variables() {
    let command = windows_run_command(
        Path::new(r"C:\Users\ana\AppData\Local\dsh-bot\dsh-bot-host.exe"),
        &vars(),
    );
    assert_eq!(
        command,
        r#""C:\Users\ana\AppData\Local\dsh-bot\dsh-bot-host.exe" service run --env "DSH_BOT_HOME=/Users/ana/.dsh-bot" --env "DSH_BOT_HOST_PORT=4872""#
    );
    assert_eq!(
        windows_supervisor_command(Path::new(r"C:\dsh-bot\dsh-bot-host.exe")),
        r"C:\dsh-bot\dsh-bot-host.exe serve-app"
    );
}

#[test]
fn a_plist_escapes_the_values_it_carries() {
    let plist = launchd_plist(
        Path::new("/tmp/a&b"),
        &[("DSH_BOT_HOME", "/tmp/<root>".to_string())],
        Path::new("/tmp/log"),
    );
    assert!(plist.contains("<string>/tmp/a&amp;b</string>"));
    assert!(plist.contains("<string>/tmp/&lt;root&gt;</string>"));
}

#[test]
fn a_windows_run_value_strips_quotes_and_a_trailing_backslash() {
    let command = windows_run_command(
        Path::new(r"C:\Program Files\dsh-bot-host.exe"),
        &[("DSH_BOT_HOME", r#"C:\a\"b\"#.to_string())],
    );
    assert_eq!(
        command,
        r#""C:\Program Files\dsh-bot-host.exe" service run --env "DSH_BOT_HOME=C:\a\b""#
    );
}
