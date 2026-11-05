//! Owns the lifecycle lock until the old dsh process group is fully reaped.

use super::environment::environment;
use crate::{Config, Result, private_file};
use fs2::FileExt;
use std::{
    io::{self, Read, Write},
    os::unix::process::CommandExt,
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

pub(super) fn alive_group(pid: u32) -> bool {
    unsafe {
        libc::kill(-(pid as i32), 0) == 0
            || io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }
}

fn signal_group(pid: u32, signal: i32) {
    unsafe {
        libc::kill(-(pid as i32), signal);
    }
}

pub(super) fn reap(child: &mut Child) -> Result<()> {
    let pid = child.id();
    signal_group(pid, libc::SIGTERM);
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let _ = child.try_wait();
        if !alive_group(pid) {
            let _ = child.wait();
            return Ok(());
        }
        if Instant::now() >= deadline {
            break;
        }
        thread::sleep(Duration::from_millis(25));
    }
    signal_group(pid, libc::SIGKILL);
    let _ = child.wait();
    let deadline = Instant::now() + Duration::from_secs(3);
    while alive_group(pid) {
        if Instant::now() >= deadline {
            return Err("旧 dsh 进程组未确认退出，保持生命周期锁".into());
        }
        thread::sleep(Duration::from_millis(25));
    }
    Ok(())
}

struct GuardedChild(Child);

impl Drop for GuardedChild {
    fn drop(&mut self) {
        while let Err(reason) = reap(&mut self.0) {
            eprintln!("{reason}");
            thread::sleep(Duration::from_secs(1));
        }
    }
}

/// Spawn official `dsh web` under a process-group lock; exit when stdin closes.
pub fn run(config: &Config) -> Result<()> {
    let lock = private_file(&config.runtime().join("lifecycle.lock"))?;
    let deadline = Instant::now() + config.startup_timeout;
    loop {
        match lock.try_lock_exclusive() {
            Ok(()) => break,
            Err(e) if e.kind() == io::ErrorKind::WouldBlock && Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(25))
            }
            Err(_) => return Err("旧后台尚未完成回收，不能启动新进程".into()),
        }
    }
    let (tx, rx) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let mut input = [0u8; 1];
        let _ = io::stdin().read(&mut input);
        let _ = tx.send(());
    });
    let (env, cli) = environment(config)?;
    if rx.try_recv().is_ok() {
        return Ok(());
    }
    let mut command = Command::new(cli);
    command
        .args([
            "web",
            "--host",
            "127.0.0.1",
            "--port",
            "0",
            "--no-open",
        ])
        .env_clear()
        .envs(env)
        .current_dir(&config.root)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .process_group(0);
    unsafe {
        command.pre_exec(|| {
            libc::signal(libc::SIGTERM, libc::SIG_DFL);
            libc::signal(libc::SIGINT, libc::SIG_DFL);
            Ok(())
        });
    }
    let mut child = GuardedChild(
        command
            .spawn()
            .map_err(|_| "无法启动官方 dsh".to_string())?,
    );
    let _ = writeln!(io::stdout(), "dsh-host-pid: {}", child.0.id());
    let _ = io::stdout().flush();
    loop {
        if rx.try_recv().is_ok() {
            break;
        }
        if child.0.try_wait().map_err(|e| e.to_string())?.is_some() {
            let _ = writeln!(io::stdout(), "dsh-host-exited");
            let _ = io::stdout().flush();
            break;
        }
        thread::sleep(Duration::from_millis(25));
    }
    drop(child);
    drop(lock);
    Ok(())
}
