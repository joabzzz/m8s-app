//! Discover this user's running Mesh instances without attaching control authority.
use crate::state::AppState;
use axum::{Json, extract::State};
use mesh_llm_host_runtime::command_support::runtime_instances::{
    runtime_root, scan_local_instances,
};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};

pub async fn local_meshes(State(state): State<Arc<AppState>>) -> Json<Value> {
    let result = async {
        let root = runtime_root()?;
        let instances = scan_local_instances(&root, std::process::id()).await?;
        let mut rows = Vec::new();
        for instance in instances.into_iter().take(16) {
            let Some(port) = instance.api_port else {
                continue;
            };
            let response = state
                .http
                .get(format!("http://127.0.0.1:{port}/api/status"))
                .timeout(Duration::from_millis(700))
                .send()
                .await;
            let Ok(response) = response else { continue };
            let Ok(response) = response.error_for_status() else {
                continue;
            };
            let Ok(bytes) = response.bytes().await else {
                continue;
            };
            if bytes.len() > 1024 * 1024 {
                continue;
            }
            let Ok(status) = serde_json::from_slice::<Value>(&bytes) else {
                continue;
            };
            let Some(node_id) = status["node_id"].as_str() else {
                continue;
            };
            rows.push(json!({"pid":instance.pid, "node_id":node_id,
                "name":status["mesh_name"].as_str().unwrap_or("Local mesh"),
                "is_self":instance.is_self, "token":status["token"].as_str(),
                "role":if status["is_client"] == true {"Passive client"} else {"Host"}}));
        }
        Ok::<_, anyhow::Error>(rows)
    };
    match tokio::time::timeout(Duration::from_secs(4), result).await {
        Ok(Ok(rows)) => Json(json!({"instances":rows})),
        _ => Json(json!({"instances":[],"unavailable":true})),
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Reconnect {
    Public {
        share: bool,
        model: Option<String>,
    },
    Join {
        token: String,
        share: bool,
        model: Option<String>,
    },
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SavedMesh {
    name: String,
    config: Reconnect,
}
fn history_path() -> std::path::PathBuf {
    let root = std::env::var_os("GOOSE_PATH_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            dirs::data_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join("m8s-app/goose")
        });
    root.join("meshes.json")
}
fn read_history() -> Vec<SavedMesh> {
    std::fs::read(history_path())
        .ok()
        .filter(|b| b.len() <= 128 * 1024)
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
pub async fn saved_meshes() -> Json<Vec<SavedMesh>> {
    Json(read_history())
}
pub async fn remember_mesh(
    Json(entry): Json<SavedMesh>,
) -> Result<Json<Value>, axum::http::StatusCode> {
    use axum::http::StatusCode;
    let valid = entry.name.len() <= 128
        && match &entry.config {
            Reconnect::Public { model, .. } => model.as_ref().is_none_or(|s| s.len() <= 2048),
            Reconnect::Join { token, model, .. } => {
                token.len() >= 40
                    && token.len() <= 8192
                    && token
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                    && model.as_ref().is_none_or(|s| s.len() <= 2048)
            }
        };
    if !valid {
        return Err(StatusCode::BAD_REQUEST);
    }
    // Serialize read/modify/write within this process; atomic replacement keeps
    // readers from seeing truncated JSON. This is reconnect history, not authority.
    static WRITE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _guard = WRITE.lock().await;
    let mut entries = read_history();
    entries.retain(|old| match (&old.config, &entry.config) {
        (Reconnect::Public { .. }, Reconnect::Public { .. }) => false,
        (Reconnect::Join { token: a, .. }, Reconnect::Join { token: b, .. }) => a != b,
        _ => true,
    });
    entries.insert(0, entry);
    entries.truncate(8);
    let path = history_path();
    let parent = path.parent().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    std::fs::create_dir_all(parent).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&tmp)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let bytes = serde_json::to_vec(&entries).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    std::fs::rename(tmp, path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({"ok":true})))
}
