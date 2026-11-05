//! Owns the lifecycle lock until the old dsh process group is fully reaped.

use super::{
    environment::environment,
    process_tree::{self, Job},
};
use crate::{Config, Result, private_file};
use fs2::FileExt;
use std::{
    io::{self, Read, Write},
    process::{Child, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

pub(super) fn alive_group(pid: u32) -> bool {
    process_tree::alive(pid)
}

pub(super) fn reap(child: &mut Child, job: &Job) -> Result<()> {
    process_tree::reap(child, job)
}

struct GuardedChild {
    child: Child,
    job: Job,
}

impl Drop for GuardedChild {
    fn drop(&mut self) {
        while let Err(reason) = reap(&mut self.child, &self.job) {
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
    let mut command = super::environment::command_for_cli(&cli);
    command
        .args(["web", "--host", "127.0.0.1", "--port", "0", "--no-open"])
        .env_clear()
        .envs(env)
        .current_dir(&config.root)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    process_tree::configure(&mut command);
    process_tree::reset_signals(&mut command);
    let child = command
        .spawn()
        .map_err(|_| "无法启动官方 dsh".to_string())?;
    let job = process_tree::attach(&child)?;
    let mut child = GuardedChild { child, job };
    let _ = writeln!(io::stdout(), "dsh-host-pid: {}", child.child.id());
    let _ = io::stdout().flush();
    loop {
        if rx.try_recv().is_ok() {
            break;
        }
        if child.child.try_wait().map_err(|e| e.to_string())?.is_some() {
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
