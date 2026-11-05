//! Executable modes, configuration and signal handling.

use myaid_host::{Config, dsh_process, host_control};
use std::sync::atomic::{AtomicBool, Ordering};

static EXIT: AtomicBool = AtomicBool::new(false);

extern "C" fn exit_signal(_: libc::c_int) {
    EXIT.store(true, Ordering::Release);
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    unsafe {
        libc::signal(
            libc::SIGTERM,
            exit_signal as *const () as libc::sighandler_t,
        );
        libc::signal(libc::SIGINT, exit_signal as *const () as libc::sighandler_t);
    }
    let result = match args.split_first() {
        Some((mode, rest)) if mode == "serve-app" && rest.is_empty() => {
            Config::product().and_then(|config| host_control::serve(config, &EXIT))
        }
        Some((mode, rest)) if mode == "serve" => {
            Config::from_args(rest).and_then(|config| host_control::serve(config, &EXIT))
        }
        Some((mode, rest)) if mode == "guardian" => {
            unsafe {
                libc::signal(libc::SIGTERM, libc::SIG_IGN);
                libc::signal(libc::SIGINT, libc::SIG_IGN);
            }
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
