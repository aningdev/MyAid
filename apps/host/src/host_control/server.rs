//! Private socket listener, peer checks, request dispatch and status subscriptions.

use super::{MAX_FRAME, PROTOCOL, Request, read_frame};
use crate::{Config, Result, dsh_process::Lifecycle, private_file};
use fs2::FileExt;
use std::{
    fs,
    io::{BufReader, Write},
    os::{
        fd::AsRawFd,
        unix::{
            fs::PermissionsExt,
            net::{UnixListener, UnixStream},
        },
    },
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread,
    time::Duration,
};

fn same_user(stream: &UnixStream) -> bool {
    #[cfg(target_os = "macos")]
    {
        let mut uid = 0;
        let mut gid = 0;
        unsafe {
            libc::getpeereid(stream.as_raw_fd(), &mut uid, &mut gid) == 0 && uid == libc::geteuid()
        }
    }
    #[cfg(target_os = "linux")]
    {
        let mut cred: libc::ucred = unsafe { std::mem::zeroed() };
        let mut size = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
        unsafe {
            libc::getsockopt(
                stream.as_raw_fd(),
                libc::SOL_SOCKET,
                libc::SO_PEERCRED,
                &mut cred as *mut _ as *mut _,
                &mut size,
            ) == 0
                && cred.uid == libc::geteuid()
        }
    }
}

fn response<T: serde::Serialize>(
    stream: &mut UnixStream,
    id: &str,
    value: Result<T>,
) -> Result<()> {
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

fn handle(mut stream: UnixStream, lifecycle: Lifecycle, exit: &AtomicBool) -> Result<()> {
    if !same_user(&stream) {
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
        "status" => response(&mut stream, &request.id, Ok(lifecycle.snapshot())),
        "connectionInfo" => response(&mut stream, &request.id, lifecycle.connection_info()),
        "watchStatus" => {
            let mut previous = String::new();
            while !exit.load(Ordering::Acquire) {
                let snapshot = lifecycle.snapshot();
                let encoded = serde_json::to_string(&snapshot).map_err(|e| e.to_string())?;
                if encoded != previous {
                    response(&mut stream, &request.id, Ok(snapshot))?;
                    previous = encoded;
                }
                let mut byte = [0u8; 1];
                let result = unsafe {
                    libc::recv(
                        stream.as_raw_fd(),
                        byte.as_mut_ptr() as *mut _,
                        1,
                        libc::MSG_PEEK | libc::MSG_DONTWAIT,
                    )
                };
                if result == 0 {
                    return Ok(());
                }
                if result > 0 {
                    return Err("Watch accepts only one request".into());
                }
                thread::sleep(Duration::from_millis(50));
            }
            Ok(())
        }
        operation => {
            let result = match operation {
                "ensureDsh" => lifecycle.ensure(request.source.as_deref() == Some("userStart")),
                "stopDsh" => lifecycle.stop(),
                "restartDsh" => lifecycle.restart(),
                _ => unreachable!(),
            };
            response(&mut stream, &request.id, result)
        }
    }
}

pub fn serve(config: Config, exit: &'static AtomicBool) -> Result<()> {
    let lock = private_file(&config.runtime().join("instance.lock"))?;
    lock.try_lock_exclusive()
        .map_err(|_| "此数据根已有宿主运行".to_string())?;
    let socket = config.socket();
    if socket.exists() {
        fs::remove_file(&socket).map_err(|e| e.to_string())?;
    }
    let listener = UnixListener::bind(&socket).map_err(|e| e.to_string())?;
    fs::set_permissions(&socket, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let lifecycle = Lifecycle::new(config)?;
    let active = Arc::new(AtomicUsize::new(0));
    let monitor_lifecycle = lifecycle.clone();
    let monitor = thread::spawn(move || {
        while !exit.load(Ordering::Acquire) {
            if let Err(error) = monitor_lifecycle.tick() {
                eprintln!("宿主生命周期故障：{error}");
            }
            thread::sleep(Duration::from_millis(20));
        }
    });
    while !exit.load(Ordering::Acquire) {
        match listener.accept() {
            Ok((stream, _)) => {
                if active.fetch_add(1, Ordering::AcqRel) >= 32 {
                    active.fetch_sub(1, Ordering::AcqRel);
                    drop(stream);
                    continue;
                }
                let active = active.clone();
                let lifecycle = lifecycle.clone();
                thread::spawn(move || {
                    let _ = handle(stream, lifecycle, exit);
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
    let _ = fs::remove_file(socket);
    let _ = monitor.join();
    drop(lifecycle);
    drop(lock);
    Ok(())
}
