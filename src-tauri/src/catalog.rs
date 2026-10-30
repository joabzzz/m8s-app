//! Read-only provider discovery through the explicitly configured m8s executable.
//! Credentials and provider responses stay out of browser state and error messages.
use crate::state::{AppState, Phase};
use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::{path::PathBuf, sync::Arc, time::Duration};

pub async fn offers(State(state): State<Arc<AppState>>) -> Response {
    if !matches!(state.phase().await, Phase::Running(_)) {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"Connect to a mesh before browsing compute."})),
        )
            .into_response();
    }
    if crate::plugin_compute::configured() {
        return match crate::plugin_compute::call(json!({"operation":"offers"})).await {
            Ok(value) => Json(value).into_response(),
            Err(_) => unavailable(),
        };
    }
    let (Some(cli), Some(credential)) = (
        crate::providers::controller().map(|p| p.into_os_string()),
        crate::providers::credential()
            .ok()
            .map(|p| p.into_os_string()),
    ) else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error":"Connect Vast in Compute → Providers before browsing hardware."})),
        )
            .into_response();
    };
    let cli = PathBuf::from(cli);
    let credential = PathBuf::from(credential);
    if !cli.is_absolute()
        || !credential.is_absolute()
        || cli.canonicalize().ok().as_ref() != Some(&cli)
    {
        return unavailable();
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let Ok(meta) = std::fs::symlink_metadata(&cli) else {
            return unavailable();
        };
        if !meta.is_file() || meta.mode() & 0o7022 != 0 || meta.mode() & 0o111 == 0 {
            return unavailable();
        }
    }
    let mut command = tokio::process::Command::new(cli);
    command
        .args(["prototype", "vast-offers", "--credential-file"])
        .arg(credential)
        .args(["--disk-gb", "80"])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .kill_on_drop(true);
    let result = tokio::time::timeout(Duration::from_secs(25), command.output()).await;
    match result {
        Ok(Ok(output)) if output.status.success() && output.stdout.len() <= 131072 => {
            match serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                Ok(value) if value.get("offers").is_some_and(|v| v.is_array()) => {
                    Json(value).into_response()
                }
                _ => unavailable(),
            }
        }
        _ => unavailable(),
    }
}
fn unavailable() -> Response {
    (StatusCode::BAD_GATEWAY, Json(json!({"error":"Could not load Vast offers. Check the controller and provider connection, then retry."}))).into_response()
}
