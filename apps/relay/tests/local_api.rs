//! The Relay binary over real HTTP: `GET /` and `GET /v1/health` answer without a token.
//!
//! Each test starts a real `dsh-bot-relay` on a random port and leaves nothing running.

use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

struct Relay {
    child: Child,
    port: u16,
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
    let mut child = Command::new(env!("CARGO_BIN_EXE_dsh-bot-relay"))
        .args(["serve", "--port", "0", "--ready-stdout"])
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
    thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = reader.read_to_end(&mut sink);
    });
    Relay { child, port }
}

fn request(port: u16, path: &str) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .expect("timeout");
    let head =
        format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
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
    let (status, body) = request(relay.port, "/");
    assert_eq!(status, 200);
    assert_eq!(body, "dsh-bot-relay");

    let (status, body) = request(relay.port, "/v1/health");
    assert_eq!(status, 200);
    let health: serde_json::Value = serde_json::from_str(&body).expect("health json");
    assert_eq!(health["service"], "dsh-bot-relay");
    assert_eq!(health["protocol"], 1);
    assert!(
        health["version"]
            .as_str()
            .is_some_and(|version| !version.is_empty())
    );
}
