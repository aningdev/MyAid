//! The Relay binary's local control API over real HTTP: liveness and health need no token, the
//! registration routes need this data root's, and a page's request gets nothing.
//!
//! Each test starts a real `dsh-bot-relay` on a random port; nothing is registered with the OS and
//! nothing is left running.

use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

struct Relay {
    child: Child,
    _dir: tempfile::TempDir,
    port: u16,
    token: String,
}

impl Drop for Relay {
    fn drop(&mut self) {
        #[cfg(unix)]
        unsafe {
            libc::kill(self.child.id() as i32, libc::SIGTERM);
        }
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            if self.child.try_wait().ok().flatten().is_some() {
                return;
            }
            thread::sleep(Duration::from_millis(20));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn start() -> Relay {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut child = Command::new(env!("CARGO_BIN_EXE_dsh-bot-relay"))
        .args(["serve", "--data-root"])
        .arg(dir.path())
        .args(["--port", "0", "--ready-stdout"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn dsh-bot-relay");
    let stdout = child.stdout.take().expect("stdout");
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).expect("ready line");
    let ready: serde_json::Value = serde_json::from_str(line.trim()).expect("ready json");
    assert_eq!(ready["event"], "ready");
    let port = ready["port"].as_u64().expect("port") as u16;
    let token = std::fs::read_to_string(dir.path().join("relay/serve-token")).expect("token");
    thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = reader.read_to_end(&mut sink);
    });
    Relay {
        child,
        _dir: dir,
        port,
        token,
    }
}

fn request(
    port: u16,
    path: &str,
    headers: &[(&str, String)],
) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .expect("timeout");
    let mut head = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n");
    for (name, value) in headers {
        if name.eq_ignore_ascii_case("Host") {
            head = head.replace(&format!("Host: 127.0.0.1:{port}\r\n"), "");
        }
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes()).expect("write");
    let mut raw = String::new();
    stream.read_to_string(&mut raw).expect("read");
    let status = raw
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .unwrap_or(0);
    let body = raw
        .split_once("\r\n\r\n")
        .map(|(_, body)| body.to_string())
        .unwrap_or_default();
    (status, body)
}

#[test]
fn liveness_and_health_answer_without_a_token() {
    let relay = start();
    let (status, body) = request(relay.port, "/", &[]);
    assert_eq!(status, 200);
    assert_eq!(body, "dsh-bot-relay");

    let (status, body) = request(relay.port, "/v1/health", &[]);
    assert_eq!(status, 200);
    let health: serde_json::Value = serde_json::from_str(&body).expect("health json");
    assert_eq!(health["service"], "dsh-bot-relay");
    assert_eq!(health["protocol"], 1);
    assert!(health["version"].as_str().is_some_and(|version| !version.is_empty()));
}

#[test]
fn the_registration_routes_need_this_data_roots_token() {
    let relay = start();
    let (status, _) = request(relay.port, "/registration", &[]);
    assert_eq!(status, 401);
    let (status, _) = request(
        relay.port,
        "/registration",
        &[("Authorization", "Bearer wrong".into())],
    );
    assert_eq!(status, 401);
    let (status, body) = request(
        relay.port,
        "/registration",
        &[("Authorization", format!("Bearer {}", relay.token))],
    );
    assert_eq!(status, 200);
    let snapshot: serde_json::Value = serde_json::from_str(&body).expect("registration json");
    assert_eq!(snapshot["relay"]["unit"], "relay");
    assert_eq!(snapshot["host"]["phase"], "notRegistered");
    assert_eq!(snapshot["version"], 1);
}

#[test]
fn a_page_is_refused_before_the_token_is_read() {
    let relay = start();
    let (status, _) = request(
        relay.port,
        "/registration",
        &[
            ("Authorization", format!("Bearer {}", relay.token)),
            ("Origin", "https://example.com".into()),
        ],
    );
    assert_eq!(status, 403);
}

#[test]
fn the_token_is_private() {
    let relay = start();
    assert_eq!(relay.token.len(), 64);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(relay._dir.path().join("relay/serve-token"))
            .expect("token")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }
}
