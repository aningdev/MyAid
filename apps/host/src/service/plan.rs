//! The Host's OS launch plan: the text an install would write, never installed by a test.
//!
//! macOS gets a launchd agent in `~/Library/LaunchAgents`, Linux a systemd user unit, and
//! Windows a per-user `Run` value that starts a supervisor (`dsh-bot-host service run`) which
//! starts `serve-app` again whenever it exits.

use std::path::{Path, PathBuf};

/// launchd label and Windows `Run` value.
pub const LABEL: &str = "com.aningdev.dshbot.host";
/// systemd user unit file name.
pub const SYSTEMD_UNIT: &str = "dsh-bot-host.service";
/// Arguments the service runs.
pub const ARGUMENTS: &[&str] = &["serve-app"];
/// Log file inside `~/Library/Logs/dsh-bot` (macOS) or the data root (Windows).
pub const LOG: &str = "host.log";

/// A log larger than this starts over when `serve-app` starts under the service.
pub(crate) const LOG_LIMIT: u64 = 20 << 20;

/// Whether the service started this process (`DSH_BOT_SERVICE=1`).
pub(crate) fn supervised() -> bool {
    std::env::var("DSH_BOT_SERVICE").is_ok_and(|value| value == "1")
}

/// The user's home folder (`HOME`, else `USERPROFILE`), when it is absolute.
pub(crate) fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
}

/// `~/.config`, systemd's home for user units.
#[cfg(target_os = "linux")]
pub(crate) fn config_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| home_dir().map(|home| home.join(".config")))
}

/// How the service stands, for the control API's registration verbs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Status {
    pub installed: bool,
    pub running: Option<u32>,
    /// Where the Host writes its log, or how to read it.
    pub log: String,
}

/// The file an install writes, and what it says.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    /// `launchd`, `systemd`, or `windows-run` (with the supervisor its value starts).
    pub mechanism: &'static str,
    pub path: PathBuf,
    pub contents: String,
}

/// The launchd plist of the Host.
pub fn launchd_plist(exe: &Path, vars: &[(&str, String)], log: &Path) -> String {
    let escape = |text: &str| {
        text.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    };
    let mut environment = String::from("\t\t<key>DSH_BOT_SERVICE</key>\n\t\t<string>1</string>\n");
    for (name, value) in vars {
        environment.push_str(&format!(
            "\t\t<key>{name}</key>\n\t\t<string>{}</string>\n",
            escape(value)
        ));
    }
    let arguments = std::iter::once(exe.to_string_lossy().into_owned())
        .chain(ARGUMENTS.iter().copied().map(str::to_string))
        .map(|argument| format!("\t\t<string>{}</string>\n", escape(&argument)))
        .collect::<String>();
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>{label}</string>
	<key>ProgramArguments</key>
	<array>
{arguments}	</array>
	<key>EnvironmentVariables</key>
	<dict>
{environment}	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>{log}</string>
	<key>StandardErrorPath</key>
	<string>{log}</string>
</dict>
</plist>
"#,
        label = LABEL,
        arguments = arguments,
        environment = environment,
        log = escape(&log.to_string_lossy()),
    )
}

/// The systemd user unit; systemd splits `ExecStart` on spaces and reads quotes.
pub fn systemd_unit(exe: &Path, vars: &[(&str, String)]) -> String {
    let quote = |text: &str| format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""));
    let mut environment = String::from("Environment=DSH_BOT_SERVICE=1\n");
    for (name, value) in vars {
        environment.push_str(&format!(
            "Environment={}\n",
            quote(&format!("{name}={value}"))
        ));
    }
    let executable = std::iter::once(exe.to_string_lossy().into_owned())
        .chain(ARGUMENTS.iter().copied().map(str::to_string))
        .map(|argument| quote(&argument))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "[Unit]\nDescription=dsh-bot: this computer's {label} background service\n\n[Service]\nExecStart={executable}\n{environment}Restart=always\nRestartSec=2\n\n[Install]\nWantedBy=default.target\n",
        label = LABEL,
    )
}

/// The Windows `Run` value: the supervisor, which names the variables a sign-in starts it without.
pub fn windows_run_command(exe: &Path, vars: &[(&str, String)]) -> String {
    let mut line = format!("\"{}\" service run", exe.display());
    for (name, value) in vars {
        // A backslash before the closing quote would escape it.
        line.push_str(&format!(
            " --env \"{name}={}\"",
            value.replace('"', "").trim_end_matches('\\')
        ));
    }
    line
}

/// What the supervisor runs in a loop on Windows.
pub fn windows_supervisor_command(exe: &Path) -> String {
    let mut line = exe.display().to_string();
    for argument in ARGUMENTS {
        line.push(' ');
        line.push_str(argument);
    }
    line
}

#[cfg(target_os = "macos")]
pub(crate) fn launchd_log() -> PathBuf {
    home_dir()
        .unwrap_or_default()
        .join("Library/Logs/dsh-bot")
        .join(LOG)
}

#[cfg(target_os = "linux")]
pub(crate) fn systemd_unit_path() -> PathBuf {
    config_dir()
        .unwrap_or_default()
        .join("systemd/user")
        .join(SYSTEMD_UNIT)
}

/// The plan for this computer: a launchd agent, a systemd unit, or a Windows `Run` value.
#[cfg(target_os = "macos")]
pub(crate) fn launch_plan(exe: &Path, vars: &[(&str, String)]) -> Plan {
    let log = launchd_log();
    Plan {
        mechanism: "launchd",
        path: home_dir()
            .unwrap_or_default()
            .join("Library/LaunchAgents")
            .join(format!("{LABEL}.plist")),
        contents: launchd_plist(exe, vars, &log),
    }
}

#[cfg(target_os = "linux")]
pub(crate) fn launch_plan(exe: &Path, vars: &[(&str, String)]) -> Plan {
    Plan {
        mechanism: "systemd",
        path: systemd_unit_path(),
        contents: systemd_unit(exe, vars),
    }
}

#[cfg(windows)]
pub(crate) fn launch_plan(exe: &Path, vars: &[(&str, String)]) -> Plan {
    Plan {
        mechanism: "windows-run",
        path: PathBuf::from(format!(
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run\{LABEL}"
        )),
        contents: windows_run_command(exe, vars),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
pub(crate) fn launch_plan(_exe: &Path, _vars: &[(&str, String)]) -> Plan {
    Plan {
        mechanism: "unsupported",
        path: PathBuf::new(),
        contents: String::new(),
    }
}
