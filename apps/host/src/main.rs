//! Executable modes, configuration and signal handling.

use myaid_host::{Config, SERVICE_UNIT, dsh_process, local_api, service};
use std::sync::atomic::{AtomicBool, Ordering};

static EXIT: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
extern "C" fn exit_signal(_: libc::c_int) {
    EXIT.store(true, Ordering::Release);
}

#[cfg(windows)]
unsafe extern "system" fn console_handler(ctrl: u32) -> i32 {
    use windows_sys::Win32::System::Console::{
        CTRL_BREAK_EVENT, CTRL_C_EVENT, CTRL_CLOSE_EVENT,
    };
    match ctrl {
        CTRL_C_EVENT | CTRL_BREAK_EVENT | CTRL_CLOSE_EVENT => {
            EXIT.store(true, Ordering::Release);
            1
        }
        _ => 0,
    }
}

fn install_exit_handlers() {
    #[cfg(unix)]
    unsafe {
        libc::signal(
            libc::SIGTERM,
            exit_signal as *const () as libc::sighandler_t,
        );
        libc::signal(libc::SIGINT, exit_signal as *const () as libc::sighandler_t);
    }
    #[cfg(windows)]
    unsafe {
        windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(console_handler), 1);
    }
}

fn ignore_terminal_signals() {
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGTERM, libc::SIG_IGN);
        libc::signal(libc::SIGINT, libc::SIG_IGN);
    }
}

fn init_logging() {
    use tracing_subscriber::EnvFilter;
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_writer(std::io::stderr)
        .try_init();
}

const USAGE: &str = "Usage: myaid-host serve-app [--port PORT] [--ready-stdout]
       myaid-host serve --data-root PATH [--port PORT] [--official-dsh|--dsh PATH] [--version VERSION] [--startup-ms MS] [--patch PATH]… [--ready-stdout]
       myaid-host guardian --data-root PATH …
       myaid-host service install|uninstall|status
       myaid-host service run [--env NAME=VALUE]…";

/// `service <verb>`: the OS registration this unit keeps for itself.
fn service_command(args: &[String]) -> Result<(), String> {
    let verb = args.first().map(String::as_str).unwrap_or_default();
    if verb == "run" {
        let mut vars: Vec<(&str, String)> = Vec::new();
        let mut rest = args.iter().skip(1);
        while let Some(flag) = rest.next() {
            if flag != "--env" {
                return Err("service run takes only --env NAME=VALUE".into());
            }
            let pair = rest.next().ok_or("--env needs NAME=VALUE")?;
            let (name, value) = pair.split_once('=').ok_or("--env needs NAME=VALUE")?;
            vars.push((Box::leak(name.to_string().into_boxed_str()), value.to_string()));
        }
        service::trim_log();
        return service::supervise(&vars);
    }
    let vars = service_variables();
    match verb {
        "install" => {
            let status = service::install(&vars)?;
            println!(
                "installed {}: {}",
                SERVICE_UNIT.label,
                status.log
            );
            Ok(())
        }
        "uninstall" => {
            let removed = service::uninstall()?;
            println!(
                "{} {}",
                SERVICE_UNIT.label,
                if removed { "unregistered" } else { "was not registered" }
            );
            Ok(())
        }
        "status" => {
            let status = service::status();
            println!(
                "{}: installed={} running={} log={}",
                SERVICE_UNIT.label,
                status.installed,
                status
                    .running
                    .map(|pid| pid.to_string())
                    .unwrap_or_else(|| "-".into()),
                status.log
            );
            Ok(())
        }
        other => Err(format!("Unknown service verb: {other}\n{USAGE}")),
    }
}

/// What `service install` passes on, so the service serves this data root and port.
fn service_variables() -> Vec<(&'static str, String)> {
    let mut vars = Vec::new();
    if let Ok(root) = std::env::var("MYAID_DATA_ROOT")
        && !root.is_empty()
    {
        vars.push(("MYAID_DATA_ROOT", root));
    }
    if let Ok(port) = std::env::var("MYAID_HOST_PORT")
        && !port.is_empty()
    {
        vars.push(("MYAID_HOST_PORT", port));
    }
    vars
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    install_exit_handlers();
    init_logging();
    let result = match args.split_first() {
        Some((mode, rest)) if mode == "serve-app" => Config::app(rest)
            .and_then(|config| local_api::serve(config, &EXIT)),
        Some((mode, rest)) if mode == "serve" => {
            Config::from_args(rest).and_then(|config| local_api::serve(config, &EXIT))
        }
        Some((mode, rest)) if mode == "guardian" => {
            ignore_terminal_signals();
            Config::from_args(rest).and_then(|config| dsh_process::run_guardian(&config))
        }
        Some((mode, rest)) if mode == "service" => service_command(rest),
        _ => Err(USAGE.into()),
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
