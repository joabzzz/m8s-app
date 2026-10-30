//! Explicit v0 process boundary: current stock Mesh cannot share Goose's SQLite ABI.
use anyhow::{Context, Result, ensure};
use serde_json::Value;
use std::{
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::process::{Child, Command};

pub fn configured() -> bool {
    std::env::var_os("M8S_STOCK_MESH").is_some()
}

pub struct StockNode {
    child: Child,
    invite: String,
    join_file: PathBuf,
}

fn executable(path: &Path) -> Result<()> {
    let m = std::fs::symlink_metadata(path)?;
    ensure!(
        path.is_absolute()
            && path.canonicalize()? == path
            && m.is_file()
            && (m.uid() == unsafe { libc::geteuid() } || m.uid() == 0)
            && m.mode() & 0o7022 == 0
            && m.mode() & 0o111 != 0,
        "Invalid stock Mesh executable"
    );
    Ok(())
}

fn private_file(path: &Path, bytes: &[u8]) -> Result<std::fs::File> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(file)
}

impl StockNode {
    pub fn invite_token(&self) -> &str {
        &self.invite
    }

    pub async fn start(
        state: &crate::state::AppState,
        owner_key: &Path,
        join: Option<&str>,
        name: Option<&str>,
    ) -> Result<Self> {
        ensure!(
            crate::plugin_compute::configured(),
            "Stock Mesh requires explicit plugin mode"
        );
        let binary =
            PathBuf::from(std::env::var_os("M8S_STOCK_MESH").context("Stock Mesh not selected")?);
        executable(&binary)?;
        // Refuse existing listeners; never attach to or stop an unrelated process.
        for port in [state.ports.api, state.ports.console] {
            let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
                .context("Selected Mesh port is occupied")?;
            drop(listener);
        }
        let parent = owner_key.parent().context("Missing owner directory")?;
        let root = parent.join(format!(
            "stock-session-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
        ));
        std::fs::DirBuilder::new().mode(0o700).create(&root)?;
        let config = root.join("config.toml");
        private_file(&config, b"")?;
        let join_file = root.join("join");
        if let Some(token) = join {
            ensure!(
                !token.is_empty()
                    && token.len() <= 16384
                    && token.bytes().all(|b| (33..=126).contains(&b)),
                "Invalid invite"
            );
            private_file(&join_file, token.as_bytes())?;
        }
        let log = private_file(&root.join("node.log"), b"")?;
        let mut command = Command::new(binary);
        command
            .args(["client", "--config"])
            .arg(&config)
            .arg("--port")
            .arg(state.ports.api.to_string())
            .arg("--console")
            .arg(state.ports.console.to_string())
            .arg("--bind-port")
            .arg("0")
            .arg("--owner-key")
            .arg(owner_key)
            .arg("--owner-required")
            .arg("--log-format")
            .arg("json")
            .env_clear()
            .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
            .env("HOME", &root)
            .env("TMPDIR", &root)
            .env("MESH_LLM_CONFIG", &config)
            .env("MESH_LLM_NODE_KEY_PATH", root.join("node.key"))
            .env("MESH_LLM_RUNTIME_ROOT", root.join("runtime"))
            .env("MESH_LLM_PLUGIN_DIR", root.join("plugins"))
            .env("MESH_LLM_NO_DEFAULT_PLUGINS", "1")
            .env("HF_HUB_CACHE", root.join("hf"))
            .env("HF_HUB_DISABLE_IMPLICIT_TOKEN", "true")
            .env("MESH_LLM_ANALYTICS", "0")
            .env("DO_NOT_TRACK", "1")
            .stdin(Stdio::null())
            .stdout(log.try_clone()?)
            .stderr(log)
            .kill_on_drop(true);
        if join.is_some() {
            command.arg("--join-file").arg(&join_file);
        }
        if let Some(name) = name {
            command.arg("--mesh-name").arg(name);
        }
        let child = command.spawn().context("Starting stock Mesh")?;
        let mut node = Self {
            child,
            invite: String::new(),
            join_file,
        };
        let ready = tokio::time::timeout(Duration::from_secs(120), async {
            loop {
                ensure!(
                    node.child.try_wait()?.is_none(),
                    "Stock Mesh exited during startup"
                );
                if let Ok(mut response) = state
                    .http
                    .get(format!(
                        "http://127.0.0.1:{}/api/status",
                        state.ports.console
                    ))
                    .timeout(Duration::from_secs(2))
                    .send()
                    .await
                    && response.status().is_success()
                {
                    let mut bytes = Vec::new();
                    while let Some(chunk) = response.chunk().await? {
                        ensure!(
                            bytes.len() + chunk.len() <= 65536,
                            "Oversized stock Mesh status"
                        );
                        bytes.extend_from_slice(&chunk);
                    }
                    let status: Value = serde_json::from_slice(&bytes)?;
                    ensure!(
                        status["version"]
                            .as_str()
                            .is_some_and(|s| s == "0.78.0" || s.starts_with("0.78.0+")),
                        "Stock Mesh version differs from qualified v0 product"
                    );
                    if status["owner"]["verified"] == true
                        && status["is_client"] == true
                        && status["is_host"] == false
                        && status["mesh_id"].as_str().is_some_and(|s| !s.is_empty())
                        && (join.is_none()
                            || status["peers"].as_array().is_some_and(|p| !p.is_empty()))
                        && let Some(invite) = status["token"]
                            .as_str()
                            .filter(|s| !s.is_empty() && s.len() <= 16384)
                    {
                        return Ok::<_, anyhow::Error>(invite.to_owned());
                    }
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        })
        .await;
        match ready {
            Ok(Ok(invite)) => {
                node.invite = invite;
                Ok(node)
            }
            result => {
                let _ = node.stop().await;
                match result {
                    Ok(Err(error)) => Err(error),
                    _ => anyhow::bail!("Stock Mesh startup timed out"),
                }
            }
        }
    }

    async fn stop(&mut self) -> Result<()> {
        if self.child.try_wait()?.is_none() {
            if let Some(pid) = self.child.id() {
                // Owned, unreaped child: no PID lookup/adoption and no process-group sweep.
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }
            match tokio::time::timeout(Duration::from_secs(8), self.child.wait()).await {
                Ok(result) => {
                    result?;
                }
                Err(_) => self.child.kill().await?,
            }
        }
        if self.join_file.exists() {
            std::fs::remove_file(&self.join_file)?;
        }
        Ok(())
    }

    pub async fn shutdown(mut self) -> Result<()> {
        self.stop().await
    }
}

impl Drop for StockNode {
    fn drop(&mut self) {
        // Child::kill_on_drop owns cancellation; discard only this session's invite.
        let _ = std::fs::remove_file(&self.join_file);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::{PermissionsExt, symlink};

    #[test]
    fn executable_refuses_shared_or_linked_programs() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let binary = root.join("mesh");
        private_file(&binary, b"#!/bin/sh\nexit 0\n").unwrap();
        assert!(executable(&binary).is_err());
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        executable(&binary).unwrap();
        let alias = root.join("alias");
        symlink(&binary, &alias).unwrap();
        assert!(executable(&alias).is_err());
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o777)).unwrap();
        assert!(executable(&binary).is_err());
    }

    #[test]
    fn private_material_never_overwrites_existing_or_linked_files() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("join");
        private_file(&file, b"synthetic-private-invite").unwrap();
        assert_eq!(std::fs::metadata(&file).unwrap().mode() & 0o777, 0o600);
        assert!(private_file(&file, b"replacement").is_err());
        let alias = root.path().join("alias");
        symlink(&file, &alias).unwrap();
        assert!(private_file(&alias, b"replacement").is_err());
        assert_eq!(std::fs::read(&file).unwrap(), b"synthetic-private-invite");
    }
}
