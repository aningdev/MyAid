//! Internal ChildHandle / ReadyFeed seam. Production adapter = guardian process;
//! tests inject lines without spawning dsh. Not part of the public Lifecycle Interface.

use super::process_tree;
use crate::{Config, Result};
use std::{
    io::{BufRead, BufReader},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver},
    },
    thread,
};

pub(super) trait ChildHandle: Send {
    fn try_wait(&mut self) -> Result<Option<()>>;
    fn close_stdin(&mut self);
}

pub(super) trait ReadyFeed: Send {
    fn take_overflow(&self) -> bool;
    fn try_recv(&self) -> Option<String>;
}

pub(super) struct Running {
    pub child: Box<dyn ChildHandle>,
    pub feed: Box<dyn ReadyFeed>,
}

/// Spawns a child whose ready lines feed the phase machine.
pub(super) trait ProcessLauncher: Send {
    fn launch(&self, config: &Config) -> Result<Running>;
}

pub(super) struct GuardianLauncher;

impl ProcessLauncher for GuardianLauncher {
    fn launch(&self, config: &Config) -> Result<Running> {
        let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
        command
            .arg("guardian")
            .args(config.arguments())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        process_tree::configure(&mut command);
        let mut child = command
            .spawn()
            .map_err(|_| "不能启动后台 guardian".to_string())?;
        let input = child.stdin.take();
        let (tx, lines) = mpsc::sync_channel(256);
        let overflow = Arc::new(AtomicBool::new(false));
        let pipes: Vec<Box<dyn std::io::Read + Send>> = vec![
            Box::new(child.stdout.take().unwrap()),
            Box::new(child.stderr.take().unwrap()),
        ];
        for pipe in pipes {
            let tx = tx.clone();
            let overflow = overflow.clone();
            thread::spawn(move || {
                let mut reader = BufReader::new(pipe);
                loop {
                    let mut line = Vec::new();
                    let mut oversized = false;
                    loop {
                        let bytes = match reader.fill_buf() {
                            Ok(bytes) => bytes,
                            Err(_) => {
                                overflow.store(true, Ordering::Release);
                                return;
                            }
                        };
                        if bytes.is_empty() {
                            break;
                        }
                        let size = bytes
                            .iter()
                            .position(|b| *b == b'\n')
                            .map_or(bytes.len(), |n| n + 1);
                        let done = bytes[size - 1] == b'\n';
                        if line.len() + size <= 16384 {
                            line.extend_from_slice(&bytes[..size]);
                        } else {
                            oversized = true;
                            overflow.store(true, Ordering::Release);
                        }
                        reader.consume(size);
                        if done {
                            break;
                        }
                    }
                    if oversized {
                        overflow.store(true, Ordering::Release);
                    }
                    if line.is_empty() && !oversized {
                        return;
                    }
                    if !oversized
                        && tx
                            .try_send(String::from_utf8_lossy(&line).trim_end().to_owned())
                            .is_err()
                    {
                        overflow.store(true, Ordering::Release);
                    }
                }
            });
        }
        Ok(Running {
            child: Box::new(OsChild { child, input }),
            feed: Box::new(ChannelFeed { lines, overflow }),
        })
    }
}

struct OsChild {
    child: Child,
    input: Option<ChildStdin>,
}

impl ChildHandle for OsChild {
    fn try_wait(&mut self) -> Result<Option<()>> {
        Ok(self
            .child
            .try_wait()
            .map_err(|e| e.to_string())?
            .map(|_| ()))
    }

    fn close_stdin(&mut self) {
        drop(self.input.take());
    }
}

struct ChannelFeed {
    lines: Receiver<String>,
    overflow: Arc<AtomicBool>,
}

impl ReadyFeed for ChannelFeed {
    fn take_overflow(&self) -> bool {
        self.overflow.swap(false, Ordering::AcqRel)
    }

    fn try_recv(&self) -> Option<String> {
        self.lines.try_recv().ok()
    }
}

/// Test adapter: preloaded ready lines + controllable exit.
#[cfg(test)]
pub(super) struct FakeChild {
    exited: Arc<AtomicBool>,
}

#[cfg(test)]
impl FakeChild {
    pub(super) fn new(exited: Arc<AtomicBool>) -> Self {
        Self { exited }
    }
}

#[cfg(test)]
impl ChildHandle for FakeChild {
    fn try_wait(&mut self) -> Result<Option<()>> {
        Ok(if self.exited.load(Ordering::Acquire) {
            Some(())
        } else {
            None
        })
    }

    fn close_stdin(&mut self) {
        self.exited.store(true, Ordering::Release);
    }
}

#[cfg(test)]
pub(super) struct FakeFeed {
    lines: std::sync::Mutex<std::collections::VecDeque<String>>,
    overflow: AtomicBool,
}

#[cfg(test)]
impl FakeFeed {
    pub(super) fn new(lines: impl IntoIterator<Item = String>) -> Self {
        Self {
            lines: std::sync::Mutex::new(lines.into_iter().collect()),
            overflow: AtomicBool::new(false),
        }
    }
}

#[cfg(test)]
impl ReadyFeed for FakeFeed {
    fn take_overflow(&self) -> bool {
        self.overflow.swap(false, Ordering::AcqRel)
    }

    fn try_recv(&self) -> Option<String> {
        self.lines.lock().unwrap().pop_front()
    }
}

#[cfg(test)]
pub(super) struct ScriptedLauncher {
    runs: std::sync::Mutex<std::collections::VecDeque<ScriptedRun>>,
}

#[cfg(test)]
pub(super) struct ScriptedRun {
    pub lines: Vec<String>,
    pub exit_immediately: bool,
}

#[cfg(test)]
impl ScriptedLauncher {
    pub(super) fn new(runs: Vec<ScriptedRun>) -> Self {
        Self {
            runs: std::sync::Mutex::new(runs.into_iter().collect()),
        }
    }
}

#[cfg(test)]
impl ProcessLauncher for ScriptedLauncher {
    fn launch(&self, _config: &Config) -> Result<Running> {
        let run = self
            .runs
            .lock()
            .unwrap()
            .pop_front()
            .ok_or_else(|| "test launcher exhausted".to_string())?;
        let exited = Arc::new(AtomicBool::new(run.exit_immediately));
        Ok(Running {
            child: Box::new(FakeChild::new(exited)),
            feed: Box::new(FakeFeed::new(run.lines)),
        })
    }
}
