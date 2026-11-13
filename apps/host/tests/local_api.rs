//! The Host binary's local control API over real HTTP: an unauthenticated caller is refused, a
//! page's request is refused, and this data root's token gets the Host's own facts.
//!
//! Each test starts a real `myaid-host` on a random port (`--port 0 --ready-stdout`) with a fake
//! dsh, so nothing here touches the real `~/.myaid` and nothing is left running.

use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    path::Path,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

struct Host {
    child: Child,
    _dir: tempfile::TempDir,
    port: u16,
    token: String,
}

impl Drop for Host {
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

fn fake_dsh(root: &Path) -> std::path::PathBuf {
    let path = root.join("fake-dsh");
    // `--version` answers the pinned version; a start reports itself ready and stays up.
    std::fs::write(
        &path,
        "#!/bin/sh\n\
         if [ \"$1\" = \"--version\" ]; then echo '0.2.2-rc.2'; exit 0; fi\n\
         echo 'dsh-host-pid: 4242'\n\
         echo 'dsh web: http://127.0.0.1:9876/?token=secret'\n\
         sleep 60\n",
    )
    .expect("write fake dsh");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    }
    path
}

fn start() -> Host {
    let dir = tempfile::tempdir().expect("tempdir");
    let dsh = fake_dsh(dir.path());
    let mut child = Command::new(env!("CARGO_BIN_EXE_myaid-host"))
        .args(["serve", "--data-root"])
        .arg(dir.path())
        .arg("--dsh")
        .arg(&dsh)
        .args(["--port", "0", "--ready-stdout"])
        .env("MYAID_DSH_PATCH", "")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn myaid-host");
    let stdout = child.stdout.take().expect("stdout");
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).expect("ready line");
    let ready: serde_json::Value = serde_json::from_str(line.trim()).expect("ready json");
    assert_eq!(ready["event"], "ready");
    let port = ready["port"].as_u64().expect("port") as u16;
    let token = std::fs::read_to_string(dir.path().join("host/serve-token")).expect("token");
    // Drain the rest so the child never blocks on a full pipe.
    thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = reader.read_to_end(&mut sink);
    });
    Host {
        child,
        _dir: dir,
        port,
        token,
    }
}

fn bearer(token: &str) -> Vec<(&'static str, String)> {
    vec![("Authorization", format!("Bearer {token}"))]
}

/// One request over a raw socket; the API answers HTTP/1.1 and closes.
fn request(
    port: u16,
    method: &str,
    path: &str,
    headers: &[(&str, String)],
    body: Option<&str>,
) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .expect("timeout");
    let body = body.unwrap_or_default();
    let mut head = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    if !body.is_empty() {
        head.push_str("Content-Type: application/json\r\n");
    }
    for (name, value) in headers {
        if name.eq_ignore_ascii_case("Host") {
            head = head.replace(&format!("Host: 127.0.0.1:{port}\r\n"), "");
        }
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str("\r\n");
    head.push_str(body);
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

fn wait_until(what: &str, mut ready: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if ready() {
            return;
        }
        thread::sleep(Duration::from_millis(20));
    }
    panic!("timed out waiting for {what}");
}

#[test]
fn the_index_answers_without_a_token_so_a_launcher_can_probe() {
    let host = start();
    let (status, body) = request(host.port, "GET", "/", &[], None);
    assert_eq!(status, 200);
    assert_eq!(body, "myaid");
}

#[test]
fn an_unauthenticated_caller_is_refused() {
    let host = start();
    for path in ["/status", "/connection", "/registration", "/watch"] {
        let (status, _) = request(host.port, "GET", path, &[], None);
        assert_eq!(status, 401, "{path} without a token");
        let (status, _) = request(
            host.port,
            "GET",
            path,
            &[("Authorization", "Bearer wrong".into())],
            None,
        );
        assert_eq!(status, 401, "{path} with another token");
    }
    for path in ["/dsh/start", "/dsh/stop", "/dsh/restart", "/registration/enable"] {
        let (status, _) = request(host.port, "POST", path, &[], None);
        assert_eq!(status, 401, "{path} without a token");
    }
}

#[test]
fn a_page_or_another_host_is_refused_before_the_token_is_read() {
    let host = start();
    let (status, _) = request(
        host.port,
        "GET",
        "/status",
        &bearer(&host.token)
            .into_iter()
            .chain([("Origin", "https://example.com".to_string())])
            .collect::<Vec<_>>(),
        None,
    );
    assert_eq!(status, 403);
    let (status, _) = request(
        host.port,
        "GET",
        "/status",
        &bearer(&host.token)
            .into_iter()
            .chain([("Host", "127.0.0.1:1".to_string())])
            .collect::<Vec<_>>(),
        None,
    );
    assert_eq!(status, 403);
}

#[test]
fn this_data_roots_token_gets_the_hosts_status_and_its_own_registration_fact() {
    let host = start();
    let (status, body) = request(host.port, "GET", "/status", &bearer(&host.token), None);
    assert_eq!(status, 200);
    let reported: serde_json::Value = serde_json::from_str(&body).expect("status json");
    assert_eq!(reported["phase"], "stopped");
    assert!(
        reported.get("url").is_none(),
        "public status carries no login URL"
    );

    let (status, body) = request(host.port, "GET", "/registration", &bearer(&host.token), None);
    assert_eq!(status, 200);
    let snapshot: serde_json::Value = serde_json::from_str(&body).expect("registration json");
    assert_eq!(snapshot["host"]["unit"], "host");
    assert_eq!(snapshot["relay"]["phase"], "notRegistered");
    assert_eq!(snapshot["version"], 1);
}

#[test]
fn starting_dsh_reports_the_lifecycle_and_its_ready_url() {
    let host = start();
    let (status, body) = request(
        host.port,
        "POST",
        "/dsh/start",
        &bearer(&host.token),
        Some(r#"{"source":"userStart"}"#),
    );
    assert_eq!(status, 200, "{body}");
    let reported: serde_json::Value = serde_json::from_str(&body).expect("status json");
    assert_eq!(reported["phase"], "ready");
    assert_eq!(reported["pid"], 4242);
    assert!(reported.get("url").is_none());

    let (status, body) = request(host.port, "GET", "/connection", &bearer(&host.token), None);
    assert_eq!(status, 200);
    let info: serde_json::Value = serde_json::from_str(&body).expect("connection json");
    assert_eq!(info["url"], "http://127.0.0.1:9876/?token=secret");
}

#[test]
fn attach_does_not_lift_a_users_stop_and_user_start_does() {
    let host = start();
    let (status, body) = request(
        host.port,
        "POST",
        "/dsh/start",
        &bearer(&host.token),
        Some(r#"{"source":"attach"}"#),
    );
    assert_eq!(status, 200);
    let reported: serde_json::Value = serde_json::from_str(&body).expect("status json");
    assert_eq!(reported["phase"], "stopped");
    assert_eq!(reported["blocked"], true);

    let (status, _) = request(
        host.port,
        "POST",
        "/dsh/start",
        &bearer(&host.token),
        Some(r#"{"source":"userStart"}"#),
    );
    assert_eq!(status, 200);
    wait_until("a ready status", || {
        let (status, body) = request(host.port, "GET", "/status", &bearer(&host.token), None);
        status == 200
            && serde_json::from_str::<serde_json::Value>(&body).unwrap()["phase"] == "ready"
    });
}

#[test]
fn the_watch_upgrade_needs_the_token_and_pushes_a_changed_snapshot() {
    let host = start();
    let (status, _) = watch(&host, None, Duration::from_secs(2));
    assert_eq!(status, 401, "a watch without a token is refused");

    let token = host.token.clone();
    let port = host.port;
    thread::spawn(move || {
        let _ = request(
            port,
            "POST",
            "/dsh/start",
            &bearer(&token),
            Some(r#"{"source":"userStart"}"#),
        );
    });
    let (status, frames) = watch(&host, Some(&host.token), Duration::from_secs(30));
    assert_eq!(status, 101, "the upgrade is accepted with the token");
    assert!(
        frames.iter().any(|frame| frame["phase"] == "ready"),
        "the subscription reports the ready snapshot: {frames:?}"
    );
}

/// Open `/watch`, then read frames for `for_until`: the Host's status subscription.
fn watch(host: &Host, token: Option<&str>, for_until: Duration) -> (u16, Vec<serde_json::Value>) {
    let mut stream = TcpStream::connect(("127.0.0.1", host.port)).expect("connect");
    stream
        .set_read_timeout(Some(for_until))
        .expect("timeout");
    let mut head = format!(
        "GET /watch HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n",
        host.port
    );
    if let Some(token) = token {
        head.push_str(&format!("Authorization: Bearer {token}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes()).expect("write");
    let mut reader = BufReader::new(stream.try_clone().expect("clone"));
    let mut status_line = String::new();
    reader.read_line(&mut status_line).expect("status line");
    let status: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .unwrap_or(0);
    if status != 101 {
        return (status, Vec::new());
    }
    // Skip the handshake headers.
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
            break;
        }
    }
    let mut frames = Vec::new();
    let deadline = Instant::now() + for_until;
    while Instant::now() < deadline {
        let Some(text) = read_frame(&mut reader) else {
            break;
        };
        if let Ok(snapshot) = serde_json::from_str::<serde_json::Value>(&text) {
            let ready = snapshot["phase"] == "ready";
            frames.push(snapshot);
            if ready {
                break;
            }
        }
    }
    (status, frames)
}

/// One unmasked server frame's text payload.
fn read_frame(reader: &mut BufReader<TcpStream>) -> Option<String> {
    let mut header = [0u8; 2];
    reader.read_exact(&mut header).ok()?;
    let length = match header[1] & 0x7f {
        126 => {
            let mut extended = [0u8; 2];
            reader.read_exact(&mut extended).ok()?;
            u16::from_be_bytes(extended) as usize
        }
        127 => {
            let mut extended = [0u8; 8];
            reader.read_exact(&mut extended).ok()?;
            u64::from_be_bytes(extended) as usize
        }
        length => length as usize,
    };
    let mut payload = vec![0u8; length];
    reader.read_exact(&mut payload).ok()?;
    String::from_utf8(payload).ok()
}
