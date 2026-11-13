//! Who may call the local control API, after lorca's `ws.rs`.
//!
//! Only local programs get in. A browser lets any page call `127.0.0.1` and leaves the check to
//! the server, so every route refuses a request that carries an `Origin` (a page's always does,
//! a native client's never does) or whose `Host` is not this port on loopback (a DNS-rebound
//! page's is not). Everything but the liveness text also takes
//! `Authorization: Bearer <token>`, compared in constant time. The token is `serve-token` in the
//! data root's private runtime directory: the Host makes it once it holds the port and keeps it
//! for later starts, and the Client reads it on each connection, so a Host it started and one it
//! found running both take it.

use crate::{Config, Result, private_file};
use axum::http::{HeaderMap, header};
use std::io::Write;
use subtle::ConstantTimeEq;

/// Read the data root's token, or make one and keep it for later starts.
pub fn token(config: &Config) -> Result<String> {
    if let Some(token) = read_token(config) {
        return Ok(token);
    }
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    let token = bytes.iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    let mut file = private_file(&config.serve_token_path())?;
    file.set_len(0).map_err(|error| error.to_string())?;
    file.write_all(token.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|error| error.to_string())?;
    Ok(token)
}

fn read_token(config: &Config) -> Option<String> {
    std::fs::read_to_string(config.serve_token_path())
        .ok()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

/// What a browser's request carries and a local client's does not.
pub fn check_caller(headers: &HeaderMap, port: u16) -> std::result::Result<(), &'static str> {
    if headers.contains_key(header::ORIGIN) {
        return Err("it has an Origin, as a web page's does");
    }
    let host = headers
        .get(header::HOST)
        .and_then(|host| host.to_str().ok())
        .unwrap_or_default();
    if ![
        format!("127.0.0.1:{port}"),
        format!("localhost:{port}"),
    ]
    .iter()
    .any(|local| host.eq_ignore_ascii_case(local))
    {
        return Err("its Host is not this port on loopback");
    }
    Ok(())
}

/// Whether the request carries this data root's token.
pub fn check_token(headers: &HeaderMap, token: &str) -> bool {
    let sent = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default();
    matches(sent, token)
}

/// Constant-time compare against the token. An empty token is never a match: a data root with
/// no token takes no client.
pub fn matches(sent: &str, token: &str) -> bool {
    !token.is_empty() && sent.as_bytes().ct_eq(token.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Duration;

    fn config(root: PathBuf) -> Config {
        let config = Config {
            logs: root.join("logs"),
            root: root.clone(),
            cli: crate::CliSource::Executable(root.join("fake-dsh")),
            version: "test".into(),
            startup_timeout: Duration::from_millis(400),
            patches: Vec::new(),
            port: 4872,
            ready_stdout: false,
        };
        config.prepare().expect("prepare");
        config
    }

    #[test]
    fn the_token_is_made_once_and_kept() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = config(dir.path().to_path_buf());
        let first = token(&config).expect("token");
        assert_eq!(first.len(), 64);
        assert_eq!(token(&config).expect("token"), first);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(config.serve_token_path())
                .expect("metadata")
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }
    }

    #[test]
    fn a_request_from_a_page_or_another_host_is_refused() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "127.0.0.1:4872".parse().unwrap());
        assert!(check_caller(&headers, 4872).is_ok());
        headers.insert(header::HOST, "localhost:4872".parse().unwrap());
        assert!(check_caller(&headers, 4872).is_ok());
        headers.insert(header::HOST, "127.0.0.1:4000".parse().unwrap());
        assert!(check_caller(&headers, 4872).is_err());
        headers.insert(header::HOST, "127.0.0.1:4872".parse().unwrap());
        headers.insert(header::ORIGIN, "https://example.com".parse().unwrap());
        assert!(check_caller(&headers, 4872).is_err());
    }

    #[test]
    fn only_the_exact_token_is_accepted() {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, "Bearer secret".parse().unwrap());
        assert!(check_token(&headers, "secret"));
        assert!(!check_token(&headers, "secre"));
        assert!(!check_token(&headers, "secret2"));
        headers.remove(header::AUTHORIZATION);
        assert!(!check_token(&headers, ""));
    }
}
