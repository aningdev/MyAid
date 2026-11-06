//! RelayControl registration ops over the local control socket (dev explicit Relay).

use myaid_background_service::RegistrationPhase;
use myaid_relay::{relay_control, Config, PROTOCOL};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

static EXIT: AtomicBool = AtomicBool::new(false);

fn registration_query(socket: &PathBuf) -> serde_json::Value {
    let mut stream = relay_control::transport::LocalStream::connect(socket).expect("connect");
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
fn relay_control_registration_query_in_dev_serve() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().join("data");
    let socket = dir.path().join("control.sock");

    let config = Config::from_args(&[
        "--data-root".into(),
        root.to_string_lossy().into(),
        "--version".into(),
        "test-version".into(),
        "--control-socket".into(),
        socket.to_string_lossy().into(),
    ])
    .expect("config");

    let serve_config = config.clone();
    let server = thread::spawn(move || relay_control::serve(serve_config, &EXIT));

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while std::time::Instant::now() < deadline {
        if socket.exists() {
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
    assert!(socket.exists(), "control socket should bind");

    let status = relay_control::call(
        &socket,
        &serde_json::json!({
            "version": PROTOCOL,
            "id": "status-1",
            "operation": "status",
        }),
    )
    .expect("status");
    assert_eq!(status.phase, "ready");

    let response = registration_query(&socket);
    assert_eq!(response["ok"], true);
    assert_eq!(response["value"]["relay"]["phase"], "notRegistered");
    assert_eq!(response["value"]["host"]["phase"], "notRegistered");

    let phase: RegistrationPhase =
        serde_json::from_value(response["value"]["relay"]["phase"].clone()).unwrap();
    assert_eq!(phase, RegistrationPhase::NotRegistered);

    EXIT.store(true, Ordering::Release);
    let _ = server.join().expect("serve thread");
}
