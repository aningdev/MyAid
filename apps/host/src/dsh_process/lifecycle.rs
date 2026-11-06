//! Process ownership: spawn guardian, parse ready, stop/restart, retry budget.

use super::{
    child::{GuardianLauncher, ProcessLauncher, Running},
    logs,
    state::{Durable, ProcessState},
};
use crate::{Config, Result, Status, generation, host_control::parse_ready_url, now};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
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

pub(super) struct DshProcess {
    config: Config,
    durable: Durable,
    running: Option<Running>,
    retry_at: Option<Instant>,
    pub(super) state: Arc<Mutex<ProcessState>>,
    pub(super) attempt: Arc<AtomicU64>,
    launcher: Box<dyn ProcessLauncher>,
}

impl DshProcess {
    pub(super) fn new(config: Config) -> Result<Self> {
        Self::with_launcher(config, Box::new(GuardianLauncher))
    }

    pub(super) fn with_launcher(config: Config, launcher: Box<dyn ProcessLauncher>) -> Result<Self> {
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
        let mut state = ProcessState::stopped(config.version.clone());
        state.blocked = !durable.user_started || durable.stopped || durable.exhausted;
        if durable.exhausted {
            state.phase = "failed".into();
            state.reason = Some("自动重启预算已耗尽，请明确启动后台".into());
        }
        let retry_at = if recover && !state.blocked {
            state.phase = "recovering".into();
            state.reason = Some("正在恢复先前已启用的后台".into());
            Some(Instant::now() + Duration::from_secs(1 << (durable.failures.len() - 1)))
        } else {
            None
        };
        Ok(Self {
            config,
            durable,
            running: None,
            retry_at,
            state: Arc::new(Mutex::new(state)),
            attempt: Arc::new(AtomicU64::new(0)),
            launcher,
        })
    }

    pub(super) fn public_status(&self) -> Status {
        self.state.lock().unwrap().to_public()
    }

    fn phase(&self, phase: &str, reason: Option<String>) {
        let mut state = self.state.lock().unwrap();
        state.phase = phase.into();
        state.reason = reason;
        if phase != "ready" {
            state.url = None;
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
            self.state.lock().unwrap().blocked = false;
            self.retry_at = None;
        }
        if self.public_status().blocked || self.running.is_some() || self.retry_at.is_some() {
            return Ok(self.public_status());
        }
        let _attempt = StartupAttempt::new(&self.attempt);
        match self.start() {
            Ok(()) => Ok(self.public_status()),
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
            let mut state = self.state.lock().unwrap();
            state.generation = Some(id);
            state.pid = None;
        }
        let running = self.launcher.launch(&self.config)?;
        self.running = Some(running);
        self.phase("starting", None);
        let deadline = Instant::now() + self.config.startup_timeout;
        loop {
            self.drain()?;
            if self.state.lock().unwrap().phase == "ready" {
                return Ok(());
            }
            if self
                .running
                .as_mut()
                .unwrap()
                .child
                .try_wait()?
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
        if running.feed.take_overflow() {
            return Err("后台输出截断或过快，不能确认当前连接".into());
        }
        while let Some(line) = running.feed.try_recv() {
            if let Some(pid) = line
                .strip_prefix("dsh-host-pid: ")
                .and_then(|s| s.parse::<u32>().ok())
            {
                self.state.lock().unwrap().pid = Some(pid);
            } else if let Some(raw) = line.strip_prefix("dsh web: ") {
                let url = parse_ready_url(raw)
                    .map_err(|_| "dsh ready 地址不符合本机认证契约".to_string())?;
                self.state.lock().unwrap().url = Some(url.to_string());
            } else if line == "dsh-host-exited" {
                self.phase("failed", Some("dsh 已退出，正在回收进程组".into()));
                return Err("dsh 已退出，正在回收进程组".into());
            } else if !line.contains("token=") {
                logs::rotate_log(&self.config, &line)?;
            }
        }
        let mut state = self.state.lock().unwrap();
        if state.pid.is_some() && state.url.is_some() {
            state.phase = "ready".into();
            state.reason = None;
        }
        Ok(())
    }

    fn cleanup(&mut self) -> Result<()> {
        self.phase("stopping", None);
        if let Some(running) = &mut self.running {
            running.child.close_stdin();
            let deadline = Instant::now() + Duration::from_secs(10);
            while running.child.try_wait()?.is_none() {
                while running.feed.try_recv().is_some() {}
                if Instant::now() >= deadline {
                    return Err("旧进程回收未确认，禁止替换或再次启动".into());
                }
                thread::sleep(Duration::from_millis(20));
            }
        }
        self.running = None;
        self.state.lock().unwrap().pid = None;
        Ok(())
    }

    fn failure(&mut self, reason: String) -> Result<()> {
        if let Err(cleanup) = self.cleanup() {
            self.phase("failed", Some(cleanup.clone()));
            self.state.lock().unwrap().blocked = true;
            return Err(cleanup);
        }
        if self.durable.stopped || !self.durable.user_started {
            self.retry_at = None;
            self.state.lock().unwrap().blocked = true;
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
            self.state.lock().unwrap().blocked = true;
            return Err(error);
        }
        self.state.lock().unwrap().blocked = self.durable.exhausted;
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
        self.state.lock().unwrap().blocked = true;
        self.retry_at = None;
        if let Err(error) = self.cleanup() {
            self.phase("failed", Some(error.clone()));
            return Err(error);
        }
        self.phase("stopped", Some("后台已由用户停止".into()));
        Ok(self.public_status())
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
                .try_wait()?
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CliSource,
        dsh_process::child::{ScriptedLauncher, ScriptedRun},
    };
    use std::time::Duration;

    fn test_env(
        launcher: Box<dyn ProcessLauncher>,
    ) -> (tempfile::TempDir, DshProcess) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let config = Config {
            logs: root.join("logs"),
            root: root.clone(),
            cli: CliSource::Executable(root.join("fake-dsh")),
            version: "test-version".into(),
            startup_timeout: Duration::from_millis(400),
            explicit_dev_host: true,
        };
        config.prepare().unwrap();
        let process = DshProcess::with_launcher(config, launcher).unwrap();
        (dir, process)
    }

    fn ready_lines() -> Vec<String> {
        vec![
            "dsh-host-pid: 4242".into(),
            "dsh web: http://127.0.0.1:9876/?token=secret".into(),
        ]
    }

    #[test]
    fn ready_public_status_strips_url() {
        let launcher = ScriptedLauncher::new(vec![ScriptedRun {
            lines: ready_lines(),
            exit_immediately: false,
        }]);
        let (_dir, mut process) = test_env(Box::new(launcher));
        let status = process.ensure(true).unwrap();
        assert_eq!(status.phase, "ready");
        assert!(status.url.is_none());
        assert_eq!(status.pid, Some(4242));

        let internal = process.state.lock().unwrap().clone();
        assert_eq!(
            internal.url.as_deref(),
            Some("http://127.0.0.1:9876/?token=secret")
        );
        let connection = internal.to_connection();
        assert_eq!(
            connection.url.as_deref(),
            Some("http://127.0.0.1:9876/?token=secret")
        );
        assert!(process.public_status().url.is_none());
    }

    #[test]
    fn failure_budget_exhausts_after_repeated_exits() {
        let runs = (0..5)
            .map(|_| ScriptedRun {
                lines: vec![],
                exit_immediately: true,
            })
            .collect();
        let launcher = ScriptedLauncher::new(runs);
        let (_dir, mut process) = test_env(Box::new(launcher));

        // First explicit start records a failure and schedules retry.
        let err = process.ensure(true).unwrap_err();
        assert!(err.contains("启动前退出") || err.contains("ready"));
        assert_eq!(process.public_status().phase, "failed");
        assert!(!process.public_status().blocked);

        // Drive retry budget via tick until exhausted (4 failures in window).
        let deadline = Instant::now() + Duration::from_secs(20);
        while Instant::now() < deadline {
            let _ = process.tick();
            let status = process.public_status();
            if status.blocked && status.phase == "failed" {
                return;
            }
            thread::sleep(Duration::from_millis(50));
        }
        panic!(
            "expected exhausted budget, got {:?}",
            process.public_status()
        );
    }

    #[test]
    fn phase_transitions_stopped_to_ready() {
        let launcher = ScriptedLauncher::new(vec![ScriptedRun {
            lines: ready_lines(),
            exit_immediately: false,
        }]);
        let (_dir, mut process) = test_env(Box::new(launcher));
        assert_eq!(process.public_status().phase, "stopped");
        assert!(process.public_status().blocked);

        let status = process.ensure(true).unwrap();
        assert_eq!(status.phase, "ready");
        assert!(!status.blocked);
        assert!(status.generation.is_some());
    }
}
