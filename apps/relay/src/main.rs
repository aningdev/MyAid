//! Executable modes, configuration and signal handling.

use dsh_bot_relay::{Config, run};
use std::sync::atomic::{AtomicBool, Ordering};

static EXIT: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
extern "C" fn exit_signal(_: libc::c_int) {
    EXIT.store(true, Ordering::Release);
}

#[cfg(windows)]
unsafe extern "system" fn console_handler(ctrl: u32) -> i32 {
    use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, CTRL_C_EVENT, CTRL_CLOSE_EVENT};
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

fn init_logging() {
    use tracing_subscriber::EnvFilter;
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_writer(std::io::stderr)
        .try_init();
}

const USAGE: &str = "Usage: dsh-bot-relay serve [--bind ADDR] [--port PORT] [--ready-stdout]";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    install_exit_handlers();
    init_logging();
    let result = match args.split_first() {
        Some((mode, rest)) if mode == "serve" => {
            Config::from_args(rest).and_then(|config| run::serve(config, &EXIT))
        }
        _ => Err(USAGE.into()),
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
