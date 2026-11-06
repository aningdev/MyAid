//! Cross-platform local control endpoint (Unix domain socket / Windows named pipe).

use crate::Result;
use interprocess::local_socket::{
    Listener as IpListener, ListenerNonblockingMode, ListenerOptions, Name, Stream as IpStream,
    ToFsName, prelude::*,
};
use std::{
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

#[cfg(unix)]
use interprocess::local_socket::GenericFilePath;
#[cfg(windows)]
use interprocess::os::windows::{
    local_socket::{ListenerOptionsExt, NamedPipe},
    security_descriptor::SecurityDescriptor,
};
#[cfg(windows)]
use widestring::U16CString;

/// Product default control endpoint for the current platform.
pub fn default_endpoint() -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(r"\\.\pipe\myaid-host")
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
        PathBuf::from(home.unwrap_or_default()).join(".myaid/host/control.sock")
    }
}

pub fn endpoint_name(path: &Path) -> Result<Name<'static>> {
    #[cfg(windows)]
    {
        let text = path.to_string_lossy();
        let name = if text.starts_with(r"\\.\pipe\") || text.starts_with("//./pipe/") {
            text.as_ref().to_fs_name::<NamedPipe>()
        } else {
            // Allow bare pipe leaf names via namespaced form.
            let full = format!(r"\\.\pipe\{text}");
            full.to_fs_name::<NamedPipe>()
        };
        name.map(|n| n.into_owned())
            .map_err(|e| format!("无效控制端点：{e}"))
    }
    #[cfg(not(windows))]
    {
        path.to_fs_name::<GenericFilePath>()
            .map(|n| n.into_owned())
            .map_err(|e| format!("无效控制端点：{e}"))
    }
}

pub struct LocalListener {
    inner: IpListener,
}

pub struct LocalStream {
    inner: IpStream,
}

impl LocalListener {
    pub fn bind(path: &Path) -> Result<Self> {
        let name = endpoint_name(path)?;
        let options = ListenerOptions::new()
            .name(name)
            .nonblocking(ListenerNonblockingMode::Accept)
            .reclaim_name(true)
            .try_overwrite(true);
        #[cfg(windows)]
        {
            // Owner + SYSTEM full access; no World ACE.
            let sddl = U16CString::from_str("D:P(A;;GA;;;OW)(A;;GA;;;SY)")
                .map_err(|e| e.to_string())?;
            let sd = SecurityDescriptor::deserialize(&sddl).map_err(|e| e.to_string())?;
            let inner = options
                .security_descriptor(sd)
                .create_sync()
                .map_err(|e| format!("无法绑定控制端点：{e}"))?;
            return Ok(Self { inner });
        }
        #[cfg(unix)]
        {
            use interprocess::os::unix::local_socket::ListenerOptionsExt;
            use interprocess::TryClone;
            use std::os::unix::fs::PermissionsExt;

            // Prefer pre-bind fchmod (no umask race). macOS and older FreeBSD
            // return Unsupported for socket fchmod — fall back to post-bind chmod.
            let with_mode = options
                .try_clone()
                .map_err(|e| format!("无法绑定控制端点：{e}"))?
                .mode(0o600);
            match with_mode.create_sync() {
                Ok(inner) => Ok(Self { inner }),
                Err(e) if e.kind() == io::ErrorKind::Unsupported => {
                    let inner = options
                        .create_sync()
                        .map_err(|e| format!("无法绑定控制端点：{e}"))?;
                    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                        .map_err(|e| format!("无法设置控制端点权限：{e}"))?;
                    Ok(Self { inner })
                }
                Err(e) => Err(format!("无法绑定控制端点：{e}")),
            }
        }
    }

    pub fn accept(&self) -> io::Result<LocalStream> {
        self.inner.accept().map(|inner| LocalStream { inner })
    }
}

impl LocalStream {
    pub fn connect(path: &Path) -> Result<Self> {
        let name = endpoint_name(path)?;
        let inner = IpStream::connect(name).map_err(|_| "后台宿主尚未运行".to_string())?;
        Ok(Self { inner })
    }

    pub fn try_clone(&self) -> io::Result<Self> {
        use interprocess::TryClone;
        self.inner.try_clone().map(|inner| Self { inner })
    }

    pub fn set_read_timeout(&self, timeout: Option<Duration>) -> io::Result<()> {
        match self.inner.set_recv_timeout(timeout) {
            Err(e) if e.kind() == io::ErrorKind::Unsupported => {
                // Named pipes have no SO_RCVTIMEO. Keep blocking so accept→read
                // does not race the client's first write (nonblocking WouldBlock
                // was closing the pipe before any response).
                let _ = timeout;
                Ok(())
            }
            other => other,
        }
    }

    pub fn set_write_timeout(&self, timeout: Option<Duration>) -> io::Result<()> {
        match self.inner.set_send_timeout(timeout) {
            Err(e) if e.kind() == io::ErrorKind::Unsupported => Ok(()),
            other => other,
        }
    }

    pub fn set_nonblocking(&self, nonblocking: bool) -> io::Result<()> {
        self.inner.set_nonblocking(nonblocking)
    }

    pub fn same_user(&self) -> bool {
        #[cfg(unix)]
        {
            match self.inner.peer_creds() {
                Ok(creds) => creds.euid() == Some(unsafe { libc::geteuid() }),
                Err(_) => false,
            }
        }
        #[cfg(windows)]
        {
            // Pipe DACL is owner-only; treat a successful connect as same-user.
            let _ = self;
            true
        }
    }

    /// Non-destructive peek: returns Ok(0) if closed, Ok(1) if data, Err(WouldBlock) if empty.
    pub fn peek_byte(&self) -> io::Result<usize> {
        #[cfg(unix)]
        {
            use std::os::fd::{AsFd, AsRawFd};
            let fd = match &self.inner {
                // interprocess UdSocket Stream exposes AsFd, not AsRawFd.
                IpStream::UdSocket(s) => s.as_fd().as_raw_fd(),
            };
            let mut byte = [0u8; 1];
            let result = unsafe {
                libc::recv(
                    fd,
                    byte.as_mut_ptr() as *mut _,
                    1,
                    libc::MSG_PEEK | libc::MSG_DONTWAIT,
                )
            };
            if result < 0 {
                let err = io::Error::last_os_error();
                if err.kind() == io::ErrorKind::WouldBlock
                    || err.raw_os_error() == Some(libc::EAGAIN)
                {
                    return Err(io::Error::from(io::ErrorKind::WouldBlock));
                }
                return Err(err);
            }
            Ok(result as usize)
        }
        #[cfg(windows)]
        {
            // Named pipes have no portable MSG_PEEK; watch loops rely on write failures for hangup.
            let _ = self;
            Err(io::Error::from(io::ErrorKind::WouldBlock))
        }
    }

    pub fn shutdown(&self) {
        // Local sockets / named pipes have no portable shutdown; drop clones instead.
        let _ = self.set_nonblocking(true);
    }

    pub fn read_with_deadline(&mut self, buf: &mut [u8], deadline: Instant) -> io::Result<usize> {
        // Prefer OS timeouts when available; otherwise poll in nonblocking mode.
        let _ = self.inner.set_nonblocking(true);
        loop {
            match self.inner.read(buf) {
                Ok(n) => return Ok(n),
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        return Err(io::Error::new(io::ErrorKind::TimedOut, "read timed out"));
                    }
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                Err(e) => return Err(e),
            }
        }
    }
}

impl Read for LocalStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.inner.read(buf)
    }
}

impl Write for LocalStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.inner.write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

impl Read for &LocalStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        (&self.inner).read(buf)
    }
}

impl Write for &LocalStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        (&self.inner).write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        (&self.inner).flush()
    }
}

/// Persist the active endpoint path for discovery / diagnostics.
pub fn write_endpoint_marker(runtime: &Path, endpoint: &Path) -> Result<()> {
    let marker = runtime.join("control.endpoint");
    std::fs::write(&marker, endpoint.to_string_lossy().as_bytes()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bind_owner_only_socket() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("control.sock");
        let _listener = LocalListener::bind(&path).expect("bind");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).expect("meta").permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "socket should be owner-only");
        }
        assert!(path.exists() || cfg!(windows));
    }
}
