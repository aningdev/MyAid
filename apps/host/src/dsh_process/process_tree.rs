//! Process-group / Job Object helpers for dsh tree ownership.

use crate::Result;
use std::process::{Child, Command};

#[cfg(windows)]
mod windows_job {
    use crate::Result;
    use std::{
        io,
        mem::zeroed,
        os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle},
        process::Child,
        ptr,
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{
                OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA,
                PROCESS_TERMINATE,
            },
        },
    };

    pub struct Job(Option<OwnedHandle>);

    impl Job {
        fn create() -> Result<Self> {
            let handle = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
            if handle.is_null() {
                return Err(format!(
                    "无法创建 Job Object：{}",
                    io::Error::last_os_error()
                ));
            }
            let job = Self(Some(unsafe { OwnedHandle::from_raw_handle(handle as RawHandle) }));
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = unsafe {
                SetInformationJobObject(
                    job.0.as_ref().unwrap().as_raw_handle() as HANDLE,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const _,
                    std::mem::size_of_val(&info) as u32,
                )
            };
            if ok == 0 {
                return Err(format!(
                    "无法配置 Job Object：{}",
                    io::Error::last_os_error()
                ));
            }
            Ok(job)
        }

        fn assign(&self, pid: u32) -> Result<()> {
            let Some(handle) = self.0.as_ref() else {
                return Ok(());
            };
            let process = unsafe {
                OpenProcess(
                    PROCESS_TERMINATE | PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION,
                    0,
                    pid,
                )
            };
            if process.is_null() {
                return Err(format!(
                    "无法打开子进程：{}",
                    io::Error::last_os_error()
                ));
            }
            let ok = unsafe { AssignProcessToJobObject(handle.as_raw_handle() as HANDLE, process) };
            unsafe {
                CloseHandle(process);
            }
            if ok == 0 {
                return Err(format!(
                    "无法将进程加入 Job：{}",
                    io::Error::last_os_error()
                ));
            }
            Ok(())
        }

        fn terminate(&self) {
            if let Some(handle) = self.0.as_ref() {
                unsafe {
                    TerminateJobObject(handle.as_raw_handle() as HANDLE, 1);
                }
            }
        }
    }

    pub fn configure(_command: &mut std::process::Command) {}

    pub fn attach(child: &Child) -> Result<Job> {
        match Job::create().and_then(|job| {
            job.assign(child.id())?;
            Ok(job)
        }) {
            Ok(job) => Ok(job),
            // Parent may already be in a Job (IDE/CI); fall back to single-process reap.
            Err(_) => Ok(Job(None)),
        }
    }

    pub fn reap(child: &mut Child, job: &Job) -> Result<()> {
        let _ = child.kill();
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if child.try_wait().map_err(|e| e.to_string())?.is_some() {
                let _ = child.wait();
                return Ok(());
            }
            if Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        job.terminate();
        let _ = child.kill();
        let _ = child.wait();
        let deadline = Instant::now() + Duration::from_secs(3);
        while child.try_wait().map_err(|e| e.to_string())?.is_none() {
            if Instant::now() >= deadline {
                return Err("旧 dsh 进程组未确认退出，保持生命周期锁".into());
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        Ok(())
    }

    pub fn alive_pid(pid: u32) -> bool {
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process.is_null() {
            return false;
        }
        unsafe {
            CloseHandle(process);
        }
        true
    }
}

#[cfg(unix)]
mod unix_group {
    use crate::Result;
    use std::{
        io,
        os::unix::process::CommandExt,
        process::{Child, Command},
        thread,
        time::{Duration, Instant},
    };

    pub struct Job;

    pub fn configure(command: &mut Command) {
        command.process_group(0);
    }

    pub fn attach(_child: &Child) -> Result<Job> {
        Ok(Job)
    }

    pub fn alive_pid(pid: u32) -> bool {
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

    pub fn reap(child: &mut Child, _job: &Job) -> Result<()> {
        let pid = child.id();
        signal_group(pid, libc::SIGTERM);
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let _ = child.try_wait();
            if !alive_pid(pid) {
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
        while alive_pid(pid) {
            if Instant::now() >= deadline {
                return Err("旧 dsh 进程组未确认退出，保持生命周期锁".into());
            }
            thread::sleep(Duration::from_millis(25));
        }
        Ok(())
    }
}

#[cfg(windows)]
use windows_job as imp;
#[cfg(unix)]
use unix_group as imp;

pub use imp::Job;

pub fn configure(command: &mut Command) {
    imp::configure(command);
}

pub fn attach(child: &Child) -> Result<Job> {
    imp::attach(child)
}

pub fn reap(child: &mut Child, job: &Job) -> Result<()> {
    imp::reap(child, job)
}

pub fn alive(pid: u32) -> bool {
    imp::alive_pid(pid)
}

#[cfg(unix)]
pub fn reset_signals(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    unsafe {
        command.pre_exec(|| {
            libc::signal(libc::SIGTERM, libc::SIG_DFL);
            libc::signal(libc::SIGINT, libc::SIG_DFL);
            Ok(())
        });
    }
}

#[cfg(windows)]
pub fn reset_signals(_command: &mut Command) {}
