use anyhow::{bail, Context};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    process::Stdio,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
};

pub struct Process {
    _child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl Process {
    pub async fn spawn(dir: &Path, lean_path: Option<&str>) -> anyhow::Result<Self> {
        let dir = dir
            .canonicalize()
            .with_context(|| format!("finding {}", dir.display()))?;

        let binary = dir.join(".lake/build/bin/repl");
        let mut command = Command::new(&binary);

        command.env_clear();

        for name in ["PATH", "HOME", "LEAN_SYSROOT", "ELAN_HOME"] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }

        if let Some(root) = sysroot(&dir) {
            command.env("LEAN_SYSROOT", root);
        }

        if let Some(path) = lean_path {
            command.env("LEAN_PATH", path);
        }

        let mut child = command
            .current_dir(&dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("starting {}", binary.display()))?;

        let stdin = child.stdin.take().context("repl stdin")?;
        let stdout = BufReader::new(child.stdout.take().context("repl stdout")?);

        Ok(Process {
            _child: child,
            stdin,
            stdout,
        })
    }

    pub async fn send(&mut self, request: &Value) -> anyhow::Result<Value> {
        let mut line = serde_json::to_string(request)?;

        line.push_str("\n\n");
        self.stdin.write_all(line.as_bytes()).await?;
        self.stdin.flush().await?;

        let mut text = String::new();

        loop {
            let mut line = String::new();

            if self.stdout.read_line(&mut line).await? == 0 {
                bail!("repl exited; is the Lean toolchain from lean-toolchain installed with elan, or LEAN_SYSROOT set?");
            }

            if line.trim().is_empty() {
                if text.trim().is_empty() {
                    continue;
                }

                break;
            }

            text.push_str(&line);
        }

        Ok(serde_json::from_str(&text)?)
    }
}

fn sysroot(dir: &Path) -> Option<PathBuf> {
    if std::env::var_os("LEAN_SYSROOT").is_some() {
        return None;
    }

    let toolchain = std::fs::read_to_string(dir.join("lean-toolchain")).ok()?;
    let name = toolchain.trim().replace('/', "--").replace(':', "---");

    let home = std::env::var_os("ELAN_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".elan")))?;

    let root = home.join("toolchains").join(name);

    root.join("lib/lean").is_dir().then_some(root)
}
