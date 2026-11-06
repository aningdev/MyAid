//! HostControl registration ops over the local control socket (dev explicit Host).

use myaid_background_service::RegistrationPhase;
use myaid_host::{host_control, CliSource, Config, PROTOCOL};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

static EXIT: AtomicBool = AtomicBool::new(false);

fn write_fake_dsh(root: &PathBuf) -> PathBuf {
    let path = root.join("fake-dsh");
    std::fs::write(&path, "#!/bin/sh\nsleep 60\n").expect("write fake dsh");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    }
    path
}

fn registration_query(socket: &PathBuf) -> serde_json::Value {
    let mut stream = host_control::transport::LocalStream::connect(socket).expect("connect");
    let request = serde_json::json!({
        "version": PROTOCOL,
        "id": "reg-query",
        "operation": "registrationQuery",
    });
    let mut bytes = serde_json::to_vec(&request).expect("encode");
    bytes.push(b'\n');
    stream.write_all(&bytes).expect("write");
    let mut line = String::new();
    BufReader::new(stream)
        .read_line(&mut line)
        .expect("read");
    serde_json::from_str(&line).expect("json")
}

#[test]
fn host_control_registration_query_in_dev_serve() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let fake_dsh = write_fake_dsh(&root);
    let socket = root.join("host/control.sock");

    let config = Config {
        logs: root.join("logs"),
        root: root.clone(),
        cli: CliSource::Executable(fake_dsh),
        version: "test-version".into(),
        startup_timeout: Duration::from_millis(400),
        explicit_dev_host: true,
    };
    config.prepare().expect("prepare");

    let serve_config = config.clone();
    let server = thread::spawn(move || host_control::serve(serve_config, &EXIT));

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while std::time::Instant::now() < deadline {
        if socket.exists() {
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
    assert!(socket.exists(), "control socket should bind");

    let response = registration_query(&socket);
    assert_eq!(response["ok"], true);
    assert_eq!(response["value"]["host"]["phase"], "notRegistered");
    assert_eq!(response["value"]["relay"]["phase"], "notRegistered");

    let phase: RegistrationPhase =
        serde_json::from_value(response["value"]["host"]["phase"].clone()).unwrap();
    assert_eq!(phase, RegistrationPhase::NotRegistered);

    EXIT.store(true, Ordering::Release);
    server.join().expect("serve thread");
}
