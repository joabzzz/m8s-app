//! Local provider onboarding. Keys never appear in status, URLs, argv or logs.
use crate::{rentals, state::AppState};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use zeroize::Zeroizing;
type Reply = Result<Json<Value>, (StatusCode, Json<Value>)>;
fn fail(message: &str) -> (StatusCode, Json<Value>) {
    (StatusCode::CONFLICT, Json(json!({"error":message})))
}
fn root() -> PathBuf {
    std::env::var_os("GOOSE_PATH_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::data_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join("m8s-app/goose")
        })
        .join("providers")
}
fn private_dir(path: &Path) -> anyhow::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt};
    if !path.exists() {
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(path)?;
    }
    let m = std::fs::symlink_metadata(path)?;
    anyhow::ensure!(
        path.is_absolute()
            && path.canonicalize()? == path
            && m.is_dir()
            && m.uid() == unsafe { libc::geteuid() }
            && m.mode() & 0o777 == 0o700,
        "Invalid provider directory"
    );
    Ok(())
}
fn settings() -> anyhow::Result<Option<Value>> {
    let path = root().join("vast.json");
    if !path.try_exists()? {
        return Ok(None);
    }
    Ok(Some(rentals::private_read(&path)?))
}
pub(crate) fn controller() -> Option<PathBuf> {
    std::env::var_os("M8S_CLI").map(PathBuf::from).or_else(|| {
        settings()
            .ok()
            .flatten()
            .and_then(|v| v["controller_file"].as_str().map(PathBuf::from))
    })
}
fn selected_plan() -> anyhow::Result<Option<PathBuf>> {
    if let Some(path) = std::env::var_os("M8S_RENTAL_PLAN") {
        return Ok(Some(PathBuf::from(path)));
    }
    Ok(settings()?.and_then(|v| v["rental_plan"].as_str().map(PathBuf::from)))
}
pub(crate) fn credential() -> anyhow::Result<PathBuf> {
    if let Some(value) = settings()? {
        anyhow::ensure!(value["disabled"] != true, "Provider disconnected");
        let p = PathBuf::from(
            value["credential_file"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing credential"))?,
        );
        anyhow::ensure!(
            p.parent() == Some(root().as_path()),
            "Invalid credential location"
        );
        return Ok(p);
    }
    std::env::var_os("M8S_VAST_CREDENTIAL_FILE")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("Provider not connected"))
}
fn read_key(path: &Path) -> anyhow::Result<Zeroizing<String>> {
    let bytes = Zeroizing::new(rentals::private_bytes(path)?);
    let text = std::str::from_utf8(&bytes)?;
    let keys: Vec<_> = text
        .lines()
        .filter_map(|line| {
            line.trim()
                .strip_prefix("export ")
                .unwrap_or(line.trim())
                .strip_prefix("VAST_API_KEY=")
        })
        .collect();
    anyhow::ensure!(keys.len() == 1, "Invalid credential file");
    let key = Zeroizing::new(keys[0].trim().trim_matches(['\'', '"']).to_owned());
    anyhow::ensure!(valid_key(&key), "Invalid credential");
    Ok(key)
}
fn valid_key(key: &str) -> bool {
    (16..=512).contains(&key.len())
        && key
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
}
async fn validate(key: &str) -> Result<u64, &'static str> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "Could not connect to Vast. Try again.")?;
    let mut response = client
        .get("https://console.vast.ai/api/v0/users/current/")
        .bearer_auth(key)
        .send()
        .await
        .map_err(|_| "Could not reach Vast. Check your connection and try again.")?;
    if matches!(response.status().as_u16(), 401 | 403) {
        return Err("Vast rejected this API key. Check its permissions or create a new key.");
    }
    if !response.status().is_success() {
        return Err("Vast could not verify the key. Try again shortly.");
    }
    let mut bytes = Zeroizing::new(Vec::new());
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Vast returned an incomplete response.")?
    {
        if bytes.len() + chunk.len() > 32768 {
            return Err("Vast returned an unexpected response.");
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| "Vast returned an unexpected response.")?;
    value["id"]
        .as_u64()
        .filter(|id| *id > 0)
        .ok_or("Vast did not return an account identity.")
}
fn store(value: &Value) -> anyhow::Result<()> {
    let dir = root();
    private_dir(&dir)?;
    let nonce =
        hex::encode(m8s_owner_identity::OwnerKeypair::generate().sign_bytes(b"provider-settings"));
    let temp = dir.join(format!("settings-{nonce}.tmp"));
    rentals::write_new(&temp, value)?;
    std::fs::rename(&temp, dir.join("vast.json"))?;
    std::fs::File::open(dir)?.sync_all()?;
    Ok(())
}
fn project(value: Option<&Value>, configured: bool) -> Value {
    json!({"id":"vast","configured":configured,"verified_at":value.and_then(|v|v["verified_at"].as_i64()),"account_id":value.and_then(|v|v["account_id"].as_u64()),"source":if value.is_some(){"app"}else{"environment"}})
}
pub async fn status() -> Json<Value> {
    let value = settings().ok().flatten();
    let configured = credential().is_ok_and(|p| p.is_file());
    Json(
        json!({"vast":project(value.as_ref(),configured),"nebius":{"id":"nebius","available":false},"controller_ready":controller().is_some_and(|p|p.is_file())}),
    )
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Connect {
    api_key: String,
}
pub async fn connect(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut request): Json<Connect>,
) -> Reply {
    rentals::authorize(&state, &headers).map_err(|_| fail("Request refused"))?;
    let input = Zeroizing::new(std::mem::take(&mut request.api_key));
    let key = Zeroizing::new(input.trim().to_owned());
    if !valid_key(&key) {
        return Err(fail(
            "Enter a valid Vast API key, without spaces or line breaks.",
        ));
    }
    let _guard = state.rentals.action.lock().await;
    if crate::plugin_compute::configured() {
        return Err(fail(
            "Provider changes for token-only v0 use the explicitly selected plugin plan. Finish cleanup before changing its credentials.",
        ));
    }
    if !rentals::provider_changes_allowed() {
        return Err(fail(
            "Remove the managed rental and wait for confirmed cleanup before changing its provider key.",
        ));
    }
    let account = validate(&key).await.map_err(fail)?;
    let selected_plan =
        selected_plan().map_err(|_| fail("Provider settings could not be read."))?;
    if let Some(path) = &selected_plan {
        let plan = rentals::private_read(path)
            .map_err(|_| fail("The managed rental profile could not be read."))?;
        if plan["expected_account_id"] != account {
            return Err(fail(
                "This device’s managed rental profile belongs to a different Vast account.",
            ));
        }
    }
    let dir = root();
    private_dir(&dir).map_err(|_| fail("Could not open private provider storage."))?;
    let nonce =
        hex::encode(m8s_owner_identity::OwnerKeypair::generate().sign_bytes(b"provider-key"));
    let file = dir.join(format!("vast-{nonce}.env"));
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(&file)
        .map_err(|_| fail("Could not save the provider key."))?;
    if writeln!(output, "VAST_API_KEY={}", key.as_str())
        .and_then(|_| output.sync_all())
        .is_err()
    {
        let _ = std::fs::remove_file(&file);
        return Err(fail("Could not save the provider key."));
    }
    let old = settings().ok().flatten();
    let value = json!({"account_id":account,"credential_file":file,"verified_at":chrono::Utc::now().timestamp(),"rental_plan":selected_plan,"controller_file":controller()});
    if store(&value).is_err() {
        let _ = std::fs::remove_file(file);
        return Err(fail("Could not save provider settings."));
    }
    remove_old_key(old.as_ref());
    state.rentals.invalidate_quote().await;
    Ok(Json(project(Some(&value), true)))
}
fn remove_old_key(value: Option<&Value>) {
    if let Some(path) = value
        .and_then(|v| v["credential_file"].as_str())
        .map(PathBuf::from)
        && path.parent() == Some(root().as_path())
        && rentals::private_bytes(&path).is_ok()
    {
        let _ = std::fs::remove_file(path);
    }
}
pub async fn verify(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Reply {
    rentals::authorize(&state, &headers).map_err(|_| fail("Request refused"))?;
    let _guard = state.rentals.action.lock().await;
    let key = read_key(&credential().map_err(|_| fail("Connect Vast first."))?)
        .map_err(|_| fail("Could not read the selected provider key."))?;
    let account = validate(&key).await.map_err(fail)?;
    Ok(Json(
        json!({"account_id":account,"verified_at":chrono::Utc::now().timestamp(),"configured":true}),
    ))
}
pub async fn disconnect(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Reply {
    rentals::authorize(&state, &headers).map_err(|_| fail("Request refused"))?;
    let _guard = state.rentals.action.lock().await;
    if crate::plugin_compute::configured() {
        return Err(fail(
            "Provider changes for token-only v0 use the explicitly selected plugin plan. Finish cleanup before changing its credentials.",
        ));
    }
    if !rentals::provider_changes_allowed() {
        return Err(fail(
            "Wait for confirmed rental cleanup before disconnecting Vast.",
        ));
    }
    let old = settings().map_err(|_| fail("Provider settings could not be read."))?;
    // Disconnect only the credential. Preserve the selected controller/profile
    // so a normal relaunch cannot silently reset historical accounting.
    let mut tombstone = old.clone().unwrap_or_else(|| json!({}));
    if let Some(object) = tombstone.as_object_mut() {
        object.remove("credential_file");
        object.remove("verified_at");
    }
    tombstone["disabled"] = json!(true);
    if let Some(path) = selected_plan().map_err(|_| fail("Provider settings could not be read."))? {
        tombstone["rental_plan"] = json!(path);
    }
    tombstone["controller_file"] = json!(controller());
    store(&tombstone).map_err(|_| fail("Could not disconnect Vast."))?;
    remove_old_key(old.as_ref());
    state.rentals.invalidate_quote().await;
    Ok(Json(json!({"disconnected":true})))
}
pub(crate) fn generated_plan() -> anyhow::Result<Value> {
    use chrono::{Datelike, TimeZone};
    let value = settings()?.ok_or_else(|| anyhow::anyhow!("Connect a provider first"))?;
    anyhow::ensure!(value["disabled"] != true, "Provider disconnected");
    let account = value["account_id"]
        .as_u64()
        .ok_or_else(|| anyhow::anyhow!("Verify provider first"))?;
    if let Some(path) = selected_plan()? {
        let plan = rentals::private_read(&path)?;
        anyhow::ensure!(
            plan["expected_account_id"] == account,
            "Rental profile account mismatch"
        );
        return Ok(plan);
    }
    let dir = root().join(format!("managed-{account}"));
    private_dir(&dir)?;
    let now = chrono::Utc::now();
    let start = chrono::Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .unwrap();
    let end = start.checked_add_months(chrono::Months::new(1)).unwrap();
    let mut plan: Value = serde_json::from_str(include_str!("managed-plan.json"))?;
    let identity = dir.join("identity.json");
    if !identity.try_exists()? {
        anyhow::ensure!(
            !dir.join("desktop-intent.json").exists(),
            "Retained attempt has no identity"
        );
        let random = hex::encode(
            m8s_owner_identity::OwnerKeypair::generate().sign_bytes(b"managed-provider-owner"),
        );
        rentals::write_new(
            &identity,
            &json!({"owner":format!("m8s-desktop-{}",&random[..32])}),
        )?;
    }
    let identity = rentals::private_read(&identity)?;
    let owner = identity["owner"]
        .as_str()
        .filter(|owner| {
            owner.strip_prefix("m8s-desktop-").is_some_and(|suffix| {
                suffix.len() == 32 && suffix.bytes().all(|b| b.is_ascii_hexdigit())
            })
        })
        .ok_or_else(|| anyhow::anyhow!("Invalid managed owner"))?;
    plan["directory"] = json!(dir.join("attempt"));
    plan["control_directory"] = json!(dir);
    plan["credential_file"] = json!(credential()?);
    plan["expected_account_id"] = json!(account);
    plan["owner"] = json!(owner);
    plan["policy"]["owner"] = json!(owner);
    plan["request"]["owner"] = json!(owner);
    plan["policy"]["baseline"]["initial_period"] = json!({"id":start.format("%Y-%m").to_string(),"starts_at":start.timestamp(),"ends_at":end.timestamp()});
    plan["policy"]["valid_from"] = json!(now.timestamp() - 1);
    plan["policy"]["valid_until"] = json!((now.timestamp() + 86400).min(end.timestamp()));
    Ok(plan)
}
pub(crate) fn setup_without_plan_allowed() -> bool {
    matches!(settings(), Ok(None))
        || settings().is_ok_and(|v| v.is_some_and(|v| v["disabled"] == true))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Destination {
    VastKeys,
    VastConsole,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpenPage {
    target: Destination,
}
pub async fn open_page(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<OpenPage>,
) -> Reply {
    rentals::authorize(&state, &headers).map_err(|_| fail("Request refused"))?;
    let url = match request.target {
        Destination::VastKeys => "https://cloud.vast.ai/manage-keys/",
        Destination::VastConsole => "https://cloud.vast.ai/instances/",
    };
    #[cfg(target_os = "macos")]
    let command = "/usr/bin/open";
    #[cfg(not(target_os = "macos"))]
    let command = "xdg-open";
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::process::Command::new(command)
            .arg(url)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .status(),
    )
    .await;
    if !matches!(result,Ok(Ok(status)) if status.success()) {
        return Err(fail("Could not open your browser. Try again."));
    }
    Ok(Json(json!({"opened":true})))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_open_accepts_only_fixed_destinations() {
        assert!(serde_json::from_value::<OpenPage>(json!({"target":"vast_keys"})).is_ok());
        for value in [
            json!({"target":"file:///private/key"}),
            json!({"target":"vast_console","url":"https://other.invalid"}),
            json!({"target":"ssh user@host"}),
        ] {
            assert!(serde_json::from_value::<OpenPage>(value).is_err());
        }
    }
    #[test]
    fn key_input_refuses_dotenv_injection() {
        assert!(valid_key("synthetic-key-123456"));
        for k in [
            "short",
            "synthetic-key-123456\nOTHER=x",
            "synthetic-key-123456\r",
            "synthetic key 123456",
        ] {
            assert!(!valid_key(k));
        }
    }
    #[test]
    fn status_never_returns_private_fields() {
        let v = json!({"account_id":7,"credential_file":"/private/secret.env","api_key":"sensitive-key","verified_at":1});
        let s = project(Some(&v), true).to_string();
        assert!(!s.contains("secret"));
        assert!(!s.contains("sensitive"));
        assert!(s.contains("account_id"));
    }
}
