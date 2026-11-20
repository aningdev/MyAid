//! OS launch plan for one Background Service unit, after lorca's `crates/cli/src/service.rs`.
//!
//! macOS gets a launchd agent in `~/Library/LaunchAgents`, Linux a systemd user unit, and
//! Windows a per-user `Run` value that starts a supervisor (`<binary> service run`) which starts
//! the unit's own command again whenever it exits. The plan is a pure function of a [`Unit`], the
//! executable, and the variables that make the service serve the same data root as the command
//! that installed it, so it is snapshotted in tests and never installed by them.

use std::path::{Path, PathBuf};

/// A log larger than this starts over when the unit's command starts under the service.
pub const LOG_LIMIT: u64 = 20 << 20;

/// Whether the service started this process (`DSH_BOT_SERVICE=1`).
pub fn supervised() -> bool {
    std::env::var("DSH_BOT_SERVICE").is_ok_and(|value| value == "1")
}

/// One Background Service unit: what the OS registration names and runs.
#[derive(Debug, Clone, Copy)]
pub struct Unit {
    /// launchd label and Windows `Run` value, e.g. `com.aningdev.dshbot.host`.
    pub label: &'static str,
    /// systemd user unit file name, e.g. `dsh-bot-host.service`.
    pub systemd_unit: &'static str,
    /// Arguments the service runs, e.g. `["serve-app"]`.
    pub arguments: &'static [&'static str],
    /// Log file inside `~/Library/Logs/dsh-bot` (macOS) or the data root (Windows).
    pub log: &'static str,
}

/// How the service stands, for the control API's registration verbs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Status {
    pub installed: bool,
    pub running: Option<u32>,
    /// Where the unit writes its log, or how to read it.
    pub log: String,
}

/// The file an install writes, and what it says: the same bytes [`install`](crate::install)
/// would put on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    /// `launchd`, `systemd`, or `windows-run` (with the supervisor its value starts).
    pub mechanism: &'static str,
    pub path: PathBuf,
    pub contents: String,
}

impl Unit {
    /// The launchd plist of this unit.
    pub fn launchd_plist(&self, exe: &Path, vars: &[(&str, String)], log: &Path) -> String {
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
            .chain(self.arguments.iter().map(|argument| argument.to_string()))
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
            label = self.label,
            arguments = arguments,
            environment = environment,
            log = escape(&log.to_string_lossy()),
        )
    }

    /// The systemd user unit; systemd splits `ExecStart` on spaces and reads quotes.
    pub fn systemd_unit(&self, exe: &Path, vars: &[(&str, String)]) -> String {
        let quote = |text: &str| format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""));
        let mut environment = String::from("Environment=DSH_BOT_SERVICE=1\n");
        for (name, value) in vars {
            environment.push_str(&format!(
                "Environment={}\n",
                quote(&format!("{name}={value}"))
            ));
        }
        let executable = std::iter::once(exe.to_string_lossy().into_owned())
            .chain(self.arguments.iter().map(|argument| argument.to_string()))
            .map(|argument| quote(&argument))
            .collect::<Vec<_>>()
            .join(" ");
        format!(
            "[Unit]\nDescription=dsh-bot: this computer's {label} background service\n\n[Service]\nExecStart={executable}\n{environment}Restart=always\nRestartSec=2\n\n[Install]\nWantedBy=default.target\n",
            label = self.label,
        )
    }

    /// The Windows `Run` value: the supervisor, which names the variables a sign-in starts it
    /// without.
    pub fn windows_run_command(&self, exe: &Path, vars: &[(&str, String)]) -> String {
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
    pub fn windows_supervisor_command(&self, exe: &Path) -> String {
        let mut line = exe.display().to_string();
        for argument in self.arguments {
            line.push(' ');
            line.push_str(argument);
        }
        line
    }

    #[cfg(target_os = "macos")]
    pub(crate) fn launchd_log(&self) -> PathBuf {
        crate::home_dir()
            .unwrap_or_default()
            .join("Library/Logs/dsh-bot")
            .join(self.log)
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn systemd_unit_path(&self) -> PathBuf {
        crate::config_dir()
            .unwrap_or_default()
            .join("systemd/user")
            .join(self.systemd_unit)
    }
}

impl Unit {
    /// The plan for this computer: a launchd agent, a systemd unit, or a Windows `Run` value.
    #[cfg(target_os = "macos")]
    pub fn plan(&self, exe: &Path, vars: &[(&str, String)]) -> Plan {
        let log = self.launchd_log();
        Plan {
            mechanism: "launchd",
            path: crate::home_dir()
                .unwrap_or_default()
                .join("Library/LaunchAgents")
                .join(format!("{}.plist", self.label)),
            contents: self.launchd_plist(exe, vars, &log),
        }
    }

    #[cfg(target_os = "linux")]
    pub fn plan(&self, exe: &Path, vars: &[(&str, String)]) -> Plan {
        Plan {
            mechanism: "systemd",
            path: self.systemd_unit_path(),
            contents: self.systemd_unit(exe, vars),
        }
    }

    #[cfg(windows)]
    pub fn plan(&self, exe: &Path, vars: &[(&str, String)]) -> Plan {
        Plan {
            mechanism: "windows-run",
            path: PathBuf::from(format!(
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run\{label}",
                label = self.label
            )),
            contents: self.windows_run_command(exe, vars),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    pub fn plan(&self, _exe: &Path, _vars: &[(&str, String)]) -> Plan {
        Plan {
            mechanism: "unsupported",
            path: PathBuf::new(),
            contents: String::new(),
        }
    }
}
