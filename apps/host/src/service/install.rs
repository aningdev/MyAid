//! OS registration verbs for the Host: write its plan, then ask launchd, systemd, or the
//! Windows `Run` key to keep it running. Tests snapshot the plan and never call these.

use super::plan::{LABEL, LOG_LIMIT, Plan, Status, launch_plan, supervised};

#[cfg(windows)]
use super::plan::ARGUMENTS;
#[cfg(any(windows, not(any(target_os = "macos", target_os = "linux"))))]
use super::plan::LOG;
#[cfg(target_os = "linux")]
use super::plan::SYSTEMD_UNIT;
use std::path::PathBuf;
use std::process::Command;

/// The binary the service runs: this one, through any symlink to it.
fn exe() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    Ok(std::fs::canonicalize(&exe).unwrap_or(exe))
}

/// Registers the Host with the OS so it runs from login on and again whenever it stops.
pub fn install(vars: &[(&str, String)]) -> Result<Status, String> {
    let exe = exe()?;
    let plan = launch_plan(&exe, vars);
    write_plan(&plan)?;
    after_install(&plan)?;
    Ok(status())
}

/// Removes the Host from the OS; returns whether it was registered.
pub fn uninstall() -> Result<bool, String> {
    let exe = exe()?;
    let plan = launch_plan(&exe, &[]);
    before_uninstall(&plan)?;
    Ok(remove_plan(&plan))
}

/// Whether the Host is registered and whether it runs now.
pub fn status() -> Status {
    read_status()
}

/// A `service run` started under the service keeps its log in bounds: launchd appends to the
/// same file forever, so one past [`LOG_LIMIT`] starts over.
pub fn trim_log() {
    #[cfg(unix)]
    if supervised() {
        let mut stat: libc::stat = unsafe { std::mem::zeroed() };
        // fd 2 is the log launchd or the supervisor gave us.
        if unsafe { libc::fstat(2, &mut stat) } == 0
            && (stat.st_mode & libc::S_IFMT) == libc::S_IFREG
            && stat.st_size as u64 > LOG_LIMIT
        {
            unsafe { libc::ftruncate(2, 0) };
        }
    }
}

/// Runs one command, and says its stderr when it fails.
fn run(command: &mut Command) -> Result<(), String> {
    let output = command.output().map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let program = command.get_program().to_string_lossy().to_string();
    Err(format!(
        "{program} failed{}",
        if text.is_empty() {
            String::new()
        } else {
            format!(": {text}")
        }
    ))
}

#[cfg(target_os = "macos")]
fn launchd_domain() -> String {
    unsafe extern "C" {
        fn getuid() -> u32;
    }
    format!("gui/{}", unsafe { getuid() })
}

#[cfg(target_os = "macos")]
fn launchd_target() -> String {
    format!("{}/{}", launchd_domain(), LABEL)
}

#[cfg(target_os = "macos")]
fn write_plan(plan: &Plan) -> Result<(), String> {
    if let Some(parent) = plan.path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if let Some(parent) = super::plan::launchd_log().parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(&plan.path, &plan.contents).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn after_install(plan: &Plan) -> Result<(), String> {
    // A service from before goes first, so the new definition is the one that runs.
    let _ = Command::new("launchctl")
        .args(["bootout", &launchd_target()])
        .output();
    run(Command::new("launchctl")
        .args(["bootstrap", &launchd_domain()])
        .arg(&plan.path))
}

#[cfg(target_os = "macos")]
fn before_uninstall(_plan: &Plan) -> Result<(), String> {
    let _ = Command::new("launchctl")
        .args(["bootout", &launchd_target()])
        .output();
    Ok(())
}

#[cfg(target_os = "macos")]
fn remove_plan(plan: &Plan) -> bool {
    let installed = plan.path.exists();
    if installed {
        let _ = std::fs::remove_file(&plan.path);
    }
    installed
}

#[cfg(target_os = "macos")]
fn read_status() -> Status {
    let exe = exe().unwrap_or_default();
    let installed = launch_plan(&exe, &[]).path.exists();
    let output = Command::new("launchctl")
        .args(["print", &launchd_target()])
        .output();
    let running = output
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .find_map(|line| {
                    line.trim()
                        .strip_prefix("pid = ")
                        .and_then(|pid| pid.trim().parse().ok())
                })
        });
    Status {
        installed,
        running,
        log: super::plan::launchd_log().display().to_string(),
    }
}

#[cfg(target_os = "linux")]
fn systemctl(args: &[&str]) -> Command {
    let mut command = Command::new("systemctl");
    command.arg("--user").args(args);
    command
}

#[cfg(target_os = "linux")]
fn write_plan(plan: &Plan) -> Result<(), String> {
    if !systemctl(&["show-environment"])
        .output()
        .is_ok_and(|out| out.status.success())
    {
        return Err("This computer has no systemd user session (a container, or WSL without systemd), so the service cannot keep the Host running. Start it from your own init system, or in tmux.".into());
    }
    if let Some(parent) = plan.path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(&plan.path, &plan.contents).map_err(|error| error.to_string())
}

#[cfg(target_os = "linux")]
fn after_install(_plan: &Plan) -> Result<(), String> {
    run(systemctl(&["daemon-reload"]))?;
    run(systemctl(&["enable", SYSTEMD_UNIT]))?;
    run(systemctl(&["restart", SYSTEMD_UNIT]))?;
    // Without lingering, the user's services stop at logout and start only at the next login.
    let user = std::env::var("USER").unwrap_or_default();
    let lingers = || {
        Command::new("loginctl")
            .args(["show-user", &user, "-p", "Linger", "--value"])
            .output()
            .is_ok_and(|out| String::from_utf8_lossy(&out.stdout).trim() == "yes")
    };
    if !user.is_empty()
        && !lingers()
        && Command::new("loginctl")
            .args(["enable-linger", &user])
            .output()
            .map_or(true, |out| !out.status.success())
    {
        eprintln!(
            "The service runs while you are logged in. To keep it running after you log out, and to start it at boot, run: sudo loginctl enable-linger {user}"
        );
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn before_uninstall(_plan: &Plan) -> Result<(), String> {
    let _ = systemctl(&["disable", "--now", SYSTEMD_UNIT]).output();
    Ok(())
}

#[cfg(target_os = "linux")]
fn remove_plan(plan: &Plan) -> bool {
    let installed = plan.path.exists();
    if installed {
        let _ = std::fs::remove_file(&plan.path);
        let _ = systemctl(&["daemon-reload"]).output();
    }
    installed
}

#[cfg(target_os = "linux")]
fn read_status() -> Status {
    let exe = exe().unwrap_or_default();
    let installed = launch_plan(&exe, &[]).path.exists();
    let output = systemctl(&["show", "-p", "MainPID", "--value", SYSTEMD_UNIT]).output();
    let running = output
        .ok()
        .and_then(|out| {
            String::from_utf8_lossy(&out.stdout)
                .trim()
                .parse::<u32>()
                .ok()
        })
        .filter(|pid| *pid != 0);
    Status {
        installed,
        running,
        log: format!("journalctl --user -u {SYSTEMD_UNIT}"),
    }
}

#[cfg(windows)]
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;

#[cfg(windows)]
fn write_plan(plan: &Plan) -> Result<(), String> {
    run(Command::new("reg").args([
        "add",
        RUN_KEY,
        "/v",
        LABEL,
        "/t",
        "REG_SZ",
        "/d",
        &plan.contents,
        "/f",
    ]))
}

#[cfg(windows)]
fn after_install(_plan: &Plan) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let exe = exe()?;
    stop_now();
    let mut command = Command::new(&exe);
    command
        .args(["service", "run"])
        .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW);
    command.spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(windows)]
fn before_uninstall(_plan: &Plan) -> Result<(), String> {
    let _ = Command::new("reg")
        .args(["delete", RUN_KEY, "/v", LABEL, "/f"])
        .output();
    stop_now();
    Ok(())
}

#[cfg(windows)]
fn remove_plan(_plan: &Plan) -> bool {
    Command::new("reg")
        .args(["query", RUN_KEY, "/v", LABEL])
        .output()
        .is_ok_and(|out| out.status.success())
}

#[cfg(windows)]
fn read_status() -> Status {
    let installed = Command::new("reg")
        .args(["query", RUN_KEY, "/v", LABEL])
        .output()
        .is_ok_and(|out| out.status.success());
    Status {
        installed,
        running: supervisor_pid(),
        log: supervisor_log().display().to_string(),
    }
}

#[cfg(windows)]
fn stop_now() {
    if let Some(pid) = supervisor_pid() {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
    let _ = std::fs::remove_file(supervisor_pid_path());
}

#[cfg(windows)]
fn supervisor_pid_path() -> PathBuf {
    data_root().join(format!("{LABEL}.pid"))
}

#[cfg(windows)]
fn supervisor_log() -> PathBuf {
    data_root().join(LOG)
}

#[cfg(windows)]
fn data_root() -> PathBuf {
    std::env::var_os("DSH_BOT_HOME")
        .map(PathBuf::from)
        .or_else(|| super::plan::home_dir().map(|home| home.join(".dsh-bot")))
        .unwrap_or_default()
}

#[cfg(windows)]
fn supervisor_pid() -> Option<u32> {
    let pid: u32 = std::fs::read_to_string(supervisor_pid_path())
        .ok()?
        .trim()
        .parse()
        .ok()?;
    process_alive(pid).then_some(pid)
}

#[cfg(windows)]
fn process_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, WAIT_TIMEOUT};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject,
    };
    unsafe {
        let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
        if handle.is_null() {
            return false;
        }
        let running = WaitForSingleObject(handle, 0) == WAIT_TIMEOUT;
        CloseHandle(handle);
        running
    }
}

/// `service run`, the supervisor on Windows: leaves the console a sign-in opened for it, then
/// runs `serve-app` from the installed binary until it is stopped, and again after a pause that
/// grows while it keeps stopping right after it starts.
#[cfg(windows)]
pub fn supervise(vars: &[(&str, String)]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    unsafe { windows_sys::Win32::System::Console::FreeConsole() };
    if supervisor_pid().is_some_and(|pid| pid != std::process::id()) {
        return Ok(());
    }
    let exe = exe()?;
    let _ = std::fs::create_dir_all(data_root());
    std::fs::write(supervisor_pid_path(), std::process::id().to_string())
        .map_err(|error| error.to_string())?;
    let mut pause = std::time::Duration::from_secs(2);
    loop {
        let log = supervisor_log();
        if std::fs::metadata(&log).is_ok_and(|metadata| metadata.len() > LOG_LIMIT) {
            let _ = std::fs::rename(&log, log.with_extension("log.1"));
        }
        let output = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log)
            .map_err(|error| error.to_string())?;
        let started = std::time::Instant::now();
        let mut command = Command::new(&exe);
        command
            .args(ARGUMENTS)
            .env("DSH_BOT_SERVICE", "1")
            .stdin(std::process::Stdio::null())
            .stdout(output.try_clone().map_err(|error| error.to_string())?)
            .stderr(output)
            .creation_flags(CREATE_NO_WINDOW);
        for (name, value) in vars {
            command.env(name, value);
        }
        command.spawn().and_then(|mut child| child.wait()).ok();
        pause = if started.elapsed() > std::time::Duration::from_secs(60) {
            std::time::Duration::from_secs(2)
        } else {
            (pause * 2).min(std::time::Duration::from_secs(60))
        };
        std::thread::sleep(pause);
    }
}

/// `service run` on the platforms whose OS runs the service itself.
#[cfg(not(windows))]
pub fn supervise(_vars: &[(&str, String)]) -> Result<(), String> {
    Err(format!(
        "{LABEL} is supervised by launchd or systemd here; `service run` is for Windows"
    ))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn write_plan(_plan: &Plan) -> Result<(), String> {
    Err("Background Service registration runs on macOS, Linux, and Windows".into())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn after_install(_plan: &Plan) -> Result<(), String> {
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn before_uninstall(_plan: &Plan) -> Result<(), String> {
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn remove_plan(_plan: &Plan) -> bool {
    false
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn read_status() -> Status {
    Status {
        installed: false,
        running: None,
        log: LOG.to_string(),
    }
}
