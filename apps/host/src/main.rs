//! Executable modes, configuration and signal handling.

use myaid_host::{Config, dsh_process, host_control};
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

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    install_exit_handlers();
    let result = match args.split_first() {
        Some((mode, rest)) if mode == "serve-app" && rest.is_empty() => {
            Config::product().and_then(|config| host_control::serve(config, &EXIT))
        }
        Some((mode, rest)) if mode == "serve" => {
            Config::from_args(rest).and_then(|config| host_control::serve(config, &EXIT))
        }
        Some((mode, rest)) if mode == "guardian" => {
            ignore_terminal_signals();
            Config::from_args(rest).and_then(|config| dsh_process::run_guardian(&config))
        }
        _ => Err(
            "Usage: myaid-host serve-app | serve|guardian --data-root PATH [--official-dsh|--dsh PATH] [--version VERSION] [--startup-ms MS]"
                .into(),
        ),
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
