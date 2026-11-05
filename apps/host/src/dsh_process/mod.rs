//! dsh lifecycle ownership. Callers use `Lifecycle`; process details stay private.

mod environment;
mod guardian;
mod lifecycle;
mod logs;
mod process_tree;
mod state;

use crate::{Config, Result, Status};
pub use guardian::run as run_guardian;
use lifecycle::DshProcess;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU64, Ordering},
};

/// Serializes lifecycle mutations; snapshots remain readable during a slow start.
#[derive(Clone)]
pub struct Lifecycle {
    process: Arc<Mutex<DshProcess>>,
    status: Arc<Mutex<Status>>,
    attempt: Arc<AtomicU64>,
}

impl Lifecycle {
    pub fn new(config: Config) -> Result<Self> {
        let process = DshProcess::new(config)?;
        Ok(Self {
            status: process.status.clone(),
            attempt: process.attempt.clone(),
            process: Arc::new(Mutex::new(process)),
        })
    }

    pub fn snapshot(&self) -> Status {
        self.status.lock().unwrap().public()
    }

    pub fn connection_info(&self) -> Result<Status> {
        let state = self.status.lock().unwrap().clone();
        if state.phase == "ready" {
            Ok(state)
        } else {
            Err(state
                .reason
                .unwrap_or_else(|| format!("后台状态：{}", state.phase)))
        }
    }

    pub fn ensure(&self, explicit: bool) -> Result<Status> {
        let observed = self.attempt.load(Ordering::Acquire);
        let mut process = self.process.lock().unwrap();
        // Odd revisions include startup failure cleanup; even revisions are settled.
        if observed % 2 == 1 || observed != self.attempt.load(Ordering::Acquire) {
            let snapshot = process.snapshot().public();
            if snapshot.phase == "ready" {
                Ok(snapshot)
            } else {
                Err(snapshot.reason.unwrap_or_else(|| "共享启动未就绪".into()))
            }
        } else {
            process.ensure(explicit)
        }
    }

    pub fn stop(&self) -> Result<Status> {
        self.process.lock().unwrap().stop()
    }

    pub fn restart(&self) -> Result<Status> {
        self.process.lock().unwrap().restart()
    }

    pub fn tick(&self) -> Result<()> {
        if let Ok(mut process) = self.process.try_lock() {
            process.tick()
        } else {
            Ok(())
        }
    }
}
