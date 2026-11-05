//! Process ownership: spawn guardian, parse ready, stop/restart, retry budget.

use super::{logs, state::Durable};
use crate::{Config, Result, Status, generation, now};
use std::os::unix::process::CommandExt;
use std::{
    io::{BufRead, BufReader},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver},
    },
    thread,
    time::{Duration, Instant},
};

struct StartupAttempt(Arc<AtomicU64>);

impl StartupAttempt {
    fn new(revision: &Arc<AtomicU64>) -> Self {
        revision.fetch_add(1, Ordering::AcqRel);
        Self(revision.clone())
    }
}

impl Drop for StartupAttempt {
    fn drop(&mut self) {
        self.0.fetch_add(1, Ordering::AcqRel);
    }
}

struct Running {
    child: Child,
    input: Option<ChildStdin>,
    lines: Receiver<String>,
    overflow: Arc<AtomicBool>,
}

pub(super) struct DshProcess {
    config: Config,
    durable: Durable,
    running: Option<Running>,
    retry_at: Option<Instant>,
    pub(super) status: Arc<Mutex<Status>>,
    pub(super) attempt: Arc<AtomicU64>,
}

impl DshProcess {
    pub(super) fn new(config: Config) -> Result<Self> {
        let mut durable = Durable::load(&config)?;
        let recover = durable.user_started && !durable.stopped && !durable.exhausted;
        if recover {
            let timestamp = now();
            durable
                .failures
                .retain(|at| timestamp.saturating_sub(*at) < 300);
            durable.failures.push(timestamp);
            durable.exhausted = durable.failures.len() > 3;
            durable.save(&config)?;
        }
        let mut status = Status::stopped(config.version.clone());
        status.blocked = !durable.user_started || durable.stopped || durable.exhausted;
        if durable.exhausted {
            status.phase = "failed".into();
            status.reason = Some("自动重启预算已耗尽，请明确启动后台".into());
        }
        let retry_at = if recover && !status.blocked {
            status.phase = "recovering".into();
            status.reason = Some("正在恢复先前已启用的后台".into());
            Some(Instant::now() + Duration::from_secs(1 << (durable.failures.len() - 1)))
        } else {
            None
        };
        Ok(Self {
            config,
            durable,
            running: None,
            retry_at,
            status: Arc::new(Mutex::new(status)),
            attempt: Arc::new(AtomicU64::new(0)),
        })
    }

    pub(super) fn snapshot(&self) -> Status {
        self.status.lock().unwrap().clone()
    }

    fn phase(&self, phase: &str, reason: Option<String>) {
        let mut status = self.status.lock().unwrap();
        status.phase = phase.into();
        status.reason = reason;
        if phase != "ready" {
            status.url = None;
        }
    }

    pub(super) fn ensure(&mut self, explicit: bool) -> Result<Status> {
        if explicit {
            let previous = (
                self.durable.user_started,
                self.durable.stopped,
                self.durable.exhausted,
                self.durable.failures.clone(),
            );
            self.durable.user_started = true;
            self.durable.stopped = false;
            self.durable.exhausted = false;
            self.durable.failures.clear();
            if let Err(error) = self.durable.save(&self.config) {
                (
                    self.durable.user_started,
                    self.durable.stopped,
                    self.durable.exhausted,
                    self.durable.failures,
                ) = previous;
                return Err(error);
            }
            self.status.lock().unwrap().blocked = false;
            self.retry_at = None;
        }
        if self.snapshot().blocked || self.running.is_some() || self.retry_at.is_some() {
            return Ok(self.snapshot().public());
        }
        let _attempt = StartupAttempt::new(&self.attempt);
        match self.start() {
            Ok(()) => Ok(self.snapshot().public()),
            Err(error) => {
                self.failure(error.clone())?;
                Err(error)
            }
        }
    }

    fn start(&mut self) -> Result<()> {
        self.phase("preparing", None);
        let id = generation()?;
        {
            let mut state = self.status.lock().unwrap();
            state.generation = Some(id);
            state.pid = None;
        }
        let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
        command
            .arg("guardian")
            .args(self.config.arguments())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .process_group(0);
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
        self.running = Some(Running {
            child,
            input,
            lines,
            overflow,
        });
        self.phase("starting", None);
        let deadline = Instant::now() + self.config.startup_timeout;
        loop {
            self.drain()?;
            if self.snapshot().phase == "ready" {
                return Ok(());
            }
            if self
                .running
                .as_mut()
                .unwrap()
                .child
                .try_wait()
                .map_err(|e| e.to_string())?
                .is_some()
            {
                return Err("dsh 启动前退出；请检查安装、版本与受限日志".into());
            }
            if Instant::now() >= deadline {
                return Err("dsh ready 超时".into());
            }
            thread::sleep(Duration::from_millis(20));
        }
    }

    fn drain(&mut self) -> Result<()> {
        let Some(running) = &mut self.running else {
            return Ok(());
        };
        if running.overflow.swap(false, Ordering::AcqRel) {
            return Err("后台输出截断或过快，不能确认当前连接".into());
        }
        while let Ok(line) = running.lines.try_recv() {
            if let Some(pid) = line
                .strip_prefix("dsh-host-pid: ")
                .and_then(|s| s.parse::<u32>().ok())
            {
                self.status.lock().unwrap().pid = Some(pid);
            } else if let Some(url) = line.strip_prefix("dsh web: ") {
                let url = url::Url::parse(url.trim()).map_err(|_| "无效 dsh ready 地址")?;
                if url.scheme() != "http"
                    || url.host_str() != Some("127.0.0.1")
                    || url.port().is_none()
                    || !url.username().is_empty()
                    || url.password().is_some()
                    || url.fragment().is_some()
                    || !url
                        .query_pairs()
                        .any(|(key, value)| key == "token" && !value.is_empty())
                {
                    return Err("dsh ready 地址不符合本机认证契约".into());
                }
                self.status.lock().unwrap().url = Some(url.to_string());
            } else if line == "dsh-host-exited" {
                self.phase("failed", Some("dsh 已退出，正在回收进程组".into()));
                return Err("dsh 已退出，正在回收进程组".into());
            } else if !line.contains("token=") {
                logs::rotate_log(&self.config, &line)?;
            }
        }
        let mut status = self.status.lock().unwrap();
        if status.pid.is_some() && status.url.is_some() {
            status.phase = "ready".into();
            status.reason = None;
        }
        Ok(())
    }

    fn cleanup(&mut self) -> Result<()> {
        self.phase("stopping", None);
        if let Some(running) = &mut self.running {
            drop(running.input.take());
            let deadline = Instant::now() + Duration::from_secs(10);
            while running
                .child
                .try_wait()
                .map_err(|e| e.to_string())?
                .is_none()
            {
                while running.lines.try_recv().is_ok() {}
                if Instant::now() >= deadline {
                    return Err("旧进程回收未确认，禁止替换或再次启动".into());
                }
                thread::sleep(Duration::from_millis(20));
            }
        }
        self.running = None;
        self.status.lock().unwrap().pid = None;
        Ok(())
    }

    fn failure(&mut self, reason: String) -> Result<()> {
        if let Err(cleanup) = self.cleanup() {
            self.phase("failed", Some(cleanup.clone()));
            self.status.lock().unwrap().blocked = true;
            return Err(cleanup);
        }
        if self.durable.stopped || !self.durable.user_started {
            self.retry_at = None;
            self.status.lock().unwrap().blocked = true;
            self.phase("stopped", Some("后台已由用户停止".into()));
            return Ok(());
        }
        let now = now();
        self.durable
            .failures
            .retain(|at| now.saturating_sub(*at) < 300);
        self.durable.failures.push(now);
        self.durable.exhausted = self.durable.failures.len() > 3;
        if let Err(error) = self.durable.save(&self.config) {
            self.phase("failed", Some(error.clone()));
            self.status.lock().unwrap().blocked = true;
            return Err(error);
        }
        self.status.lock().unwrap().blocked = self.durable.exhausted;
        self.phase("failed", Some(reason));
        self.retry_at = if self.durable.exhausted {
            None
        } else {
            Some(Instant::now() + Duration::from_secs(1 << (self.durable.failures.len() - 1)))
        };
        Ok(())
    }

    pub(super) fn stop(&mut self) -> Result<Status> {
        self.durable.stopped = true;
        self.durable.save(&self.config)?;
        self.status.lock().unwrap().blocked = true;
        self.retry_at = None;
        if let Err(error) = self.cleanup() {
            self.phase("failed", Some(error.clone()));
            return Err(error);
        }
        self.phase("stopped", Some("后台已由用户停止".into()));
        Ok(self.snapshot().public())
    }

    pub(super) fn restart(&mut self) -> Result<Status> {
        self.stop()?;
        self.ensure(true)
    }

    pub(super) fn tick(&mut self) -> Result<()> {
        if self.running.is_some() {
            if let Err(error) = self.drain() {
                return self.failure(error);
            }
            if self
                .running
                .as_mut()
                .unwrap()
                .child
                .try_wait()
                .map_err(|e| e.to_string())?
                .is_some()
            {
                self.failure("dsh 意外退出".into())?;
            }
        }
        if self.retry_at.is_some_and(|at| Instant::now() >= at) {
            self.retry_at = None;
            let _attempt = StartupAttempt::new(&self.attempt);
            if let Err(error) = self.start() {
                self.failure(error)?;
            }
        }
        Ok(())
    }
}

impl Drop for DshProcess {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}
