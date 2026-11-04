//! Executable modes, configuration and signal handling (empty shell).
use myaid_host::{Config, dsh_process, host_control};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.split_first() {
        Some((mode, rest)) if mode == "serve-app" && rest.is_empty() => {
            Config::product().and_then(|config| host_control::serve(config))
        }
        Some((mode, rest)) if mode == "serve" => {
            Config::from_args(rest).and_then(|config| host_control::serve(config))
        }
        Some((mode, rest)) if mode == "guardian" => {
            Config::from_args(rest).and_then(|config| dsh_process::run_guardian(&config))
        }
        _ => Err(
            "Usage: myaid-host serve-app | serve | guardian --data-root PATH (empty shell)"
                .into(),
        ),
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
