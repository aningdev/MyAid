//! Private socket listener, peer checks, request dispatch and status subscriptions.

use super::{
    MAX_FRAME, PROTOCOL, Request, Status, read_frame,
    transport::{LocalListener, LocalStream, write_endpoint_marker},
};
use crate::{Config, Result, generation, private_file};
use fs2::FileExt;
use std::{
    io::{BufReader, Write},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread,
    time::Duration,
};

fn response(stream: &mut LocalStream, id: &str, value: Result<Status>) -> Result<()> {
    let value = match value {
        Ok(value) => serde_json::json!({"version":PROTOCOL,"id":id,"ok":true,"value":value}),
        Err(error) => serde_json::json!({"version":PROTOCOL,"id":id,"ok":false,"error":error}),
    };
    let bytes = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
    if bytes.len() >= MAX_FRAME {
        return Err("Response too large".into());
    }
    stream
        .write_all(&bytes)
        .and_then(|_| stream.write_all(b"\n"))
        .map_err(|e| e.to_string())
}

fn handle(mut stream: LocalStream, status: Status, exit: &AtomicBool) -> Result<()> {
    if !stream.same_user() {
        return Err("Peer user rejected".into());
    }
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    let text = read_frame(&mut BufReader::new(
        stream.try_clone().map_err(|e| e.to_string())?,
    ))?;
    let request: Request = serde_json::from_str(&text).map_err(|_| "Invalid request fields")?;
    request.validate()?;
    match request.operation.as_str() {
        "status" => response(&mut stream, &request.id, Ok(status.clone())),
        "watchStatus" => {
            let mut previous = String::new();
            while !exit.load(Ordering::Acquire) {
                let encoded = serde_json::to_string(&status).map_err(|e| e.to_string())?;
                if encoded != previous {
                    response(&mut stream, &request.id, Ok(status.clone()))?;
                    previous = encoded;
                }
                match stream.peek_byte() {
                    Ok(0) => return Ok(()),
                    Ok(_) => return Err("Watch accepts only one request".into()),
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
                    Err(_) => return Ok(()),
                }
                thread::sleep(Duration::from_millis(50));
            }
            Ok(())
        }
        _ => unreachable!(),
    }
}

pub fn serve(config: Config, exit: &'static AtomicBool) -> Result<()> {
    let lock = private_file(&config.runtime().join("instance.lock"))?;
    lock.try_lock_exclusive()
        .map_err(|_| "此数据根已有转发运行".to_string())?;
    let socket = config.socket();
    #[cfg(unix)]
    if socket.exists() {
        std::fs::remove_file(&socket).map_err(|e| e.to_string())?;
    }
    let listener = LocalListener::bind(&socket)?;
    write_endpoint_marker(&config.runtime(), &socket)?;
    let status = Status::ready(
        config.version.clone(),
        generation()?,
        std::process::id(),
    );
    let active = Arc::new(AtomicUsize::new(0));
    let exit = exit;
    while !exit.load(Ordering::Acquire) {
        match listener.accept() {
            Ok(stream) => {
                if active.fetch_add(1, Ordering::AcqRel) >= 32 {
                    active.fetch_sub(1, Ordering::AcqRel);
                    drop(stream);
                    continue;
                }
                let active = active.clone();
                let status = status.clone();
                thread::spawn(move || {
                    let _ = handle(stream, status, exit);
                    active.fetch_sub(1, Ordering::AcqRel);
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(20))
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    drop(listener);
    #[cfg(unix)]
    let _ = std::fs::remove_file(socket);
    drop(lock);
    Ok(())
}
