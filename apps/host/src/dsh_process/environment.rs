//! Login environment discovery and pinned CLI validation.

use super::guardian::{alive_group, reap};
use super::process_tree;
use crate::{CliSource, Config, Result};
use std::{
    collections::BTreeMap,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

fn capture(mut command: Command, limit: usize) -> Result<Vec<u8>> {
    process_tree::configure(&mut command);
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "无法执行后台初始化检查".to_string())?;
    let job = match process_tree::attach(&child) {
        Ok(job) => Some(job),
        Err(_) if child.try_wait().ok().flatten().is_some() => None,
        Err(error) => return Err(error),
    };
    let pipe = child.stdout.take().ok_or("No check output")?;
    let (tx, rx) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = pipe.take(limit as u64 + 1).read_to_end(&mut bytes);
        let _ = tx.send((result, bytes));
    });
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                if let Some(job) = &job
                    && alive_group(child.id())
                {
                    reap(&mut child, job)?;
                }
                let (result, bytes) = rx
                    .recv_timeout(Duration::from_secs(1))
                    .map_err(|_| "初始化输出未结束".to_string())?;
                result.map_err(|_| "无法读取后台初始化结果".to_string())?;
                if !status.success() || bytes.len() > limit {
                    return Err("后台初始化检查失败或输出过大".into());
                }
                return Ok(bytes);
            }
            None if Instant::now() >= deadline => {
                if let Some(job) = &job {
                    reap(&mut child, job)?;
                } else {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                return Err("后台初始化检查超时".into());
            }
            None => thread::sleep(Duration::from_millis(20)),
        }
    }
}

#[cfg(unix)]
fn login_environment() -> Result<BTreeMap<String, String>> {
    let mut command = Command::new("/bin/zsh");
    command.args(["-lc", "printf '\\0'; /usr/bin/env -0"]);
    let bytes = capture(command, 2 * 1024 * 1024)?;
    let start = bytes
        .iter()
        .position(|byte| *byte == 0)
        .ok_or("登录环境读取失败")?;
    let mut env = BTreeMap::new();
    for pair in bytes[start + 1..].split(|byte| *byte == 0) {
        let Ok(pair) = std::str::from_utf8(pair) else {
            continue;
        };
        if let Some((key, value)) = pair.split_once('=')
            && !key.is_empty()
            && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            env.insert(key.into(), value.into());
        }
    }
    Ok(env)
}

#[cfg(windows)]
fn accept_env_key(key: &str) -> bool {
    !key.is_empty() && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

/// Merge HKLM / HKCU persistent env. Long-lived parents (Cursor) often miss User
/// vars set after they started; dsh still needs `DEEPSEEK_API_KEY` and friends.
#[cfg(windows)]
fn merge_registry_env(env: &mut BTreeMap<String, String>) {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let sources = [
        (
            HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        ),
        (HKEY_CURRENT_USER, r"Environment"),
    ];
    for (hive, path) in sources {
        let Ok(root) = RegKey::predef(hive).open_subkey_with_flags(path, KEY_READ) else {
            continue;
        };
        for (key, _) in root.enum_values().flatten() {
            if !accept_env_key(&key) {
                continue;
            }
            let Ok(value) = root.get_value::<String, _>(&key) else {
                continue;
            };
            // Prefer the running process env; only fill keys the parent never inherited.
            env.entry(key.to_ascii_uppercase()).or_insert(value);
        }
    }
}

#[cfg(windows)]
fn login_environment() -> Result<BTreeMap<String, String>> {
    let mut env = BTreeMap::new();
    for (key, value) in std::env::vars() {
        if accept_env_key(&key) {
            // Windows env is case-insensitive; normalize so PATH lookups match `Path`.
            env.insert(key.to_ascii_uppercase(), value);
        }
    }
    merge_registry_env(&mut env);
    Ok(env)
}

fn path_var(env: &BTreeMap<String, String>) -> Result<&str> {
    env.get("PATH")
        .or_else(|| env.get("Path"))
        .map(String::as_str)
        .ok_or_else(|| "登录环境缺少 PATH".into())
}

#[cfg(windows)]
fn strip_verbatim(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path
    }
}

#[cfg(not(windows))]
fn strip_verbatim(path: PathBuf) -> PathBuf {
    path
}

/// Build a Command that can launch `.cmd` / `.bat` wrappers on Windows.
pub(super) fn command_for_cli(cli: &Path) -> Command {
    #[cfg(windows)]
    {
        let ext = cli
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext == "cmd" || ext == "bat" {
            let mut command = Command::new("cmd.exe");
            command.arg("/D").arg("/C").arg(cli);
            return command;
        }
    }
    Command::new(cli)
}

fn resolve_official_cli(path_env: &str) -> Result<PathBuf> {
    #[cfg(windows)]
    let candidates = ["dsh.exe", "dsh.cmd", "dsh.bat", "dsh"];
    #[cfg(not(windows))]
    let candidates = ["dsh"];

    std::env::split_paths(path_env)
        .flat_map(|dir| candidates.iter().map(move |name| dir.join(name)))
        .find(|path| {
            path.is_absolute()
                && path.metadata().is_ok_and(|m| m.is_file())
                && {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        path.metadata()
                            .is_ok_and(|m| m.permissions().mode() & 0o111 != 0)
                    }
                    #[cfg(windows)]
                    {
                        true
                    }
                }
        })
        .and_then(|path| std::fs::canonicalize(path).ok())
        .map(strip_verbatim)
        .ok_or_else(|| "请先安装官方 dsh CLI；登录环境中找不到可执行文件".into())
}

pub(super) fn environment(
    config: &Config,
) -> Result<(BTreeMap<String, String>, PathBuf)> {
    let mut env = login_environment()?;
    env.insert(
        "DSH_HOME".into(),
        config.root.to_string_lossy().into_owned(),
    );
    env.insert(
        "DSH_AGENTS_HOME".into(),
        config.root.join("agents").to_string_lossy().into_owned(),
    );
    let cli = match &config.cli {
        CliSource::Executable(path) => strip_verbatim(path.clone()),
        CliSource::Official => resolve_official_cli(path_var(&env)?)?,
    };
    let mut command = command_for_cli(&cli);
    command.arg("--version").env_clear().envs(&env);
    let actual = capture(command, 1024)?;
    if String::from_utf8_lossy(&actual).trim() != config.version {
        return Err(format!("官方 dsh 版本不兼容，需要 {}", config.version));
    }
    Ok((env, cli))
}
