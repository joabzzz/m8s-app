//! Opt-in desktop adapter for the same m8s.operator/v0 boundary exposed by MCP.
//! The plugin owns rental policy and effects; this layer never takes tokens/keys.
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::io::AsyncWriteExt;
pub fn configured() -> bool {
    std::env::var_os("M8S_PLUGIN").is_some()
}
pub async fn call(request: Value) -> Result<Value> {
    use std::os::unix::fs::MetadataExt;
    let executable = PathBuf::from(
        std::env::var_os("M8S_PLUGIN").ok_or_else(|| anyhow::anyhow!("Plugin not configured"))?,
    );
    let meta = std::fs::symlink_metadata(&executable)?;
    ensure!(
        executable.is_absolute()
            && executable.canonicalize()? == executable
            && meta.is_file()
            && meta.uid() == unsafe { libc::geteuid() }
            && meta.mode() & 0o7022 == 0
            && meta.mode() & 0o111 != 0,
        "Invalid plugin executable"
    );
    let mut child = tokio::process::Command::new(executable)
        .arg("--request")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()?;
    let mut input = child
        .stdin
        .take()
        .ok_or_else(|| anyhow::anyhow!("Missing request pipe"))?;
    input.write_all(&serde_json::to_vec(&request)?).await?;
    input.shutdown().await?;
    drop(input);
    let output = tokio::time::timeout(Duration::from_secs(35), child.wait_with_output()).await??;
    ensure!(
        output.status.success() && output.stdout.len() <= 131072,
        "Plugin operation refused"
    );
    let reply: Value = serde_json::from_slice(&output.stdout)?;
    ensure!(
        reply["schema"] == "m8s.operator/v0",
        "Unsupported plugin protocol"
    );
    Ok(reply["result"].clone())
}
pub async fn status() -> Result<Value> {
    let s = call(json!({"operation":"status"})).await?;
    let stage = if s["provider_confirmed_removed"] == true {
        "removed"
    } else if s["removal_requested"] == true {
        "removal_requested"
    } else if s["ready"] == true {
        "token_inference_verified"
    } else {
        "token_provisioning"
    };
    Ok(
        json!({"configured":true,"admission":"token-only-provider-trusted","rental":if s["attempt_consumed"]==true {json!({"stage":stage,"worker_status":s["worker_status"],"target":s["target"],"offer_id":s["offer_id"],"instance_id":s["instance_id"],"node_id":s["node_id"],"expires_at":s["expires_at"],"certificate_verified":false})}else{Value::Null}}),
    )
}

/// Bind paid operations to the node currently displayed by this app, as well
/// as the plugin's private target. The caller holds the app lifecycle lock.
pub async fn selected_target(state: &crate::state::AppState) -> Result<Value> {
    ensure!(
        matches!(state.phase().await, crate::state::Phase::Running(_)),
        "Mesh detached"
    );
    let selected = call(json!({"operation":"status"})).await?;
    let mut response = state
        .http
        .get(format!(
            "http://127.0.0.1:{}/api/status",
            state.ports.console
        ))
        .timeout(Duration::from_secs(3))
        .send()
        .await?
        .error_for_status()?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        ensure!(bytes.len() + chunk.len() <= 65536, "Oversized mesh status");
        bytes.extend_from_slice(&chunk);
    }
    let current: Value = serde_json::from_slice(&bytes)?;
    ensure!(
        current["node_id"].is_string()
            && current["mesh_id"].is_string()
            && current["node_id"] == selected["target"]["node_id"]
            && current["mesh_id"] == selected["target"]["mesh_id"],
        "Selected mesh changed"
    );
    Ok(selected["target"].clone())
}
