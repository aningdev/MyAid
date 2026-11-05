//! Login environment discovery and pinned CLI validation.

use super::guardian::{alive_group, reap};
use crate::{CliSource, Config, Result};
use std::{
    collections::BTreeMap,
    io::Read,
    os::unix::process::CommandExt,
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

fn capture(mut command: Command, limit: usize) -> Result<Vec<u8>> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|_| "无法执行后台初始化检查".to_string())?;
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
                if alive_group(child.id()) {
                    reap(&mut child)?;
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
                reap(&mut child)?;
                return Err("后台初始化检查超时".into());
            }
            None => thread::sleep(Duration::from_millis(20)),
        }
    }
}

pub(super) fn environment(
    config: &Config,
) -> Result<(BTreeMap<String, String>, std::path::PathBuf)> {
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
    env.insert(
        "DSH_HOME".into(),
        config.root.to_string_lossy().into_owned(),
    );
    env.insert(
        "DSH_AGENTS_HOME".into(),
        config.root.join("agents").to_string_lossy().into_owned(),
    );
    let cli = match &config.cli {
        CliSource::Executable(path) => path.clone(),
        CliSource::Official => {
            use std::os::unix::fs::PermissionsExt;
            std::env::split_paths(env.get("PATH").ok_or("登录环境缺少 PATH")?)
                .map(|path| path.join("dsh"))
                .find(|path| {
                    path.is_absolute()
                        && path
                            .metadata()
                            .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
                })
                .and_then(|path| std::fs::canonicalize(path).ok())
                .ok_or("请先安装官方 dsh CLI；登录环境中找不到可执行文件")?
        }
    };
    let mut command = Command::new(&cli);
    command.arg("--version").env_clear().envs(&env);
    let actual = capture(command, 1024)?;
    if String::from_utf8_lossy(&actual).trim() != config.version {
        return Err(format!("官方 dsh 版本不兼容，需要 {}", config.version));
    }
    Ok((env, cli))
}
