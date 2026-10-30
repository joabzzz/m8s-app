//! One bounded current-mesh attempt. Persist intent before spawning the
//! controller. A retained attempt blocks replacement until explicitly reconciled.
use crate::{
    attachment::{self, Target},
    state::AppState,
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct Rentals {
    quote: Mutex<Option<Quote>>,
    pub(crate) action: Mutex<()>,
}
struct Quote {
    id: String,
    target: Target,
    plan: Value,
    observed: i64,
    prices: Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuoteRequest {
    machine_id: Option<u64>,
    offer_id: u64,
    node_id: String,
    mesh_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LaunchRequest {
    quote_id: String,
}
fn now() -> i64 {
    chrono::Utc::now().timestamp()
}
pub(crate) fn authorize(state: &AppState, headers: &HeaderMap) -> Result<(), StatusCode> {
    if headers.get("x-m8s-desktop").and_then(|v| v.to_str().ok()) != Some("1")
        || headers.get("origin").is_some_and(|v| {
            v.to_str().ok() != Some(format!("http://127.0.0.1:{}", state.ports.app).as_str())
        })
    {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(())
}
pub(crate) fn private_bytes(path: &Path) -> anyhow::Result<Vec<u8>> {
    use std::io::Read;
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    anyhow::ensure!(
        path.is_absolute() && path.canonicalize()? == path,
        "Invalid path"
    );
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)?;
    let meta = file.metadata()?;
    anyhow::ensure!(
        meta.is_file()
            && meta.uid() == unsafe { libc::geteuid() }
            && meta.mode() & 0o077 == 0
            && meta.nlink() == 1
            && meta.len() <= 32768,
        "Invalid private file"
    );
    let mut bytes = Vec::new();
    file.take(32769).read_to_end(&mut bytes)?;
    anyhow::ensure!(bytes.len() <= 32768, "Oversized file");
    Ok(bytes)
}
pub(crate) fn private_read(path: &Path) -> anyhow::Result<Value> {
    Ok(serde_json::from_slice(&private_bytes(path)?)?)
}
pub(crate) fn write_new(path: &Path, value: &Value) -> anyhow::Result<()> {
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)?;
    file.write_all(&serde_json::to_vec(value)?)?;
    file.sync_all()?;
    std::fs::File::open(
        path.parent()
            .ok_or_else(|| anyhow::anyhow!("Missing parent"))?,
    )?
    .sync_all()?;
    Ok(())
}
fn config() -> anyhow::Result<(PathBuf, Value)> {
    use std::os::unix::fs::MetadataExt;
    let cli = crate::providers::controller()
        .ok_or_else(|| anyhow::anyhow!("Controller not configured"))?;
    let meta = std::fs::symlink_metadata(&cli)?;
    anyhow::ensure!(
        cli.is_absolute()
            && cli.canonicalize()? == cli
            && meta.is_file()
            && meta.uid() == unsafe { libc::geteuid() }
            && meta.mode() & 0o7022 == 0
            && meta.mode() & 0o111 != 0,
        "Invalid controller"
    );
    let mut plan = if let Some(path) = std::env::var_os("M8S_RENTAL_PLAN") {
        private_read(Path::new(&path))?
    } else {
        crate::providers::generated_plan()?
    };
    plan["credential_file"] = json!(crate::providers::credential()?);
    anyhow::ensure!(
        plan["schema"] == "m8s.vast-demo/v1" && plan["model"] == "qwen3.8-27b",
        "Unsupported rental plan"
    );
    let cap = plan["policy"]["trial_all_in"]
        .as_u64()
        .and_then(|v| v.checked_sub(plan["policy"]["baseline"]["prior_lifetime_spent"].as_u64()?))
        .ok_or_else(|| anyhow::anyhow!("Invalid budget"))?;
    anyhow::ensure!((1..=6_000_000).contains(&cap), "Invalid budget");
    Ok((cli, plan))
}
fn directory(plan: &Value) -> anyhow::Result<PathBuf> {
    use std::os::unix::fs::MetadataExt;
    let dir = PathBuf::from(
        plan["control_directory"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing control directory"))?,
    );
    let meta = std::fs::symlink_metadata(&dir)?;
    anyhow::ensure!(
        dir.is_absolute()
            && dir.canonicalize()? == dir
            && meta.is_dir()
            && meta.uid() == unsafe { libc::geteuid() }
            && meta.mode() & 0o777 == 0o700,
        "Invalid control directory"
    );
    Ok(dir)
}
fn quote_estimate(plan: &Value, prices: &Value, at: i64) -> anyhow::Result<u64> {
    let get = |value: &Value| {
        value
            .as_u64()
            .ok_or_else(|| anyhow::anyhow!("Missing budget amount"))
    };
    let policy = &plan["policy"];
    let quote = &plan["request"]["quote"];
    let runtime = get(&quote["runtime_seconds"])?;
    let cleanup = get(&quote["cleanup_seconds"])?;
    let seconds = runtime
        .checked_add(cleanup)
        .ok_or_else(|| anyhow::anyhow!("Invalid duration"))?;
    anyhow::ensure!(
        runtime > 0
            && runtime <= get(&policy["max_runtime_seconds"])?
            && seconds <= 1800
            && cleanup >= get(&policy["minimum_cleanup_seconds"])?
            && cleanup >= 240,
        "Invalid duration"
    );
    let end = at
        .checked_add(seconds as i64)
        .ok_or_else(|| anyhow::anyhow!("Invalid deadline"))?;
    anyhow::ensure!(
        policy["valid_from"].as_i64().is_some_and(|v| v <= at)
            && policy["valid_until"].as_i64().is_some_and(|v| v >= end),
        "Approval expired"
    );
    let contingency = get(&quote["contingency"])?;
    anyhow::ensure!(
        contingency >= get(&policy["minimum_contingency"])? && contingency > 0,
        "Invalid reserve"
    );
    let compute = (u128::from(get(&prices["compute_micro_usd_per_hour"])?) * u128::from(seconds))
        .div_ceil(3600);
    let storage = (u128::from(get(&prices["storage_micro_usd_per_hour"])?) * u128::from(seconds))
        .div_ceil(3600);
    let total = compute
        + storage
        + u128::from(get(&prices["transfer_micro_usd_per_gb"])?) * 64
        + u128::from(contingency);
    let hourly = (total * 3600).div_ceil(u128::from(runtime));
    let baseline = &policy["baseline"];
    anyhow::ensure!(
        total + u128::from(get(&baseline["prior_lifetime_spent"])?)
            <= u128::from(get(&policy["trial_all_in"])?)
            && total + u128::from(get(&baseline["prior_current_period_spent"])?)
                <= u128::from(get(&policy["monthly_all_in"])?)
            && hourly <= u128::from(get(&policy["instance_hourly"])?)
            && hourly <= u128::from(get(&policy["total_hourly"])?),
        "Budget does not cover the full reserve"
    );
    Ok(u64::try_from(total)?)
}

pub async fn quote(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<QuoteRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let fail = |message: &str| (StatusCode::CONFLICT, Json(json!({"error":message})));
    authorize(&state, &headers).map_err(|s| (s, Json(json!({"error":"Request refused"}))))?;
    if crate::plugin_compute::configured() {
        let _lifecycle = state.lifecycle.lock().await;
        let current = crate::plugin_compute::selected_target(&state)
            .await
            .map_err(|_| fail("Plugin target unavailable or selected mesh changed."))?;
        if current["node_id"] != req.node_id || current["mesh_id"] != req.mesh_id {
            return Err(fail("Plugin is configured for a different mesh."));
        }
        return crate::plugin_compute::call(
            json!({"operation":"quote","offer_id":req.offer_id,"machine_id":req.machine_id}),
        )
        .await
        .map(Json)
        .map_err(|_| fail("Plugin could not qualify this offer and budget."));
    }
    let _action = state.rentals.action.lock().await;
    let (target, _) = attachment::target(&state).await.map_err(|_| {
        fail("The active node must have a verified app owner. Reconnect this mesh and retry.")
    })?;
    if target.node_id != req.node_id || target.mesh_id != req.mesh_id {
        return Err(fail("The mesh changed. Review the instance again."));
    }
    let (cli, mut plan) = config().map_err(|_| {
        fail("Current-mesh rentals need an explicit bounded rental plan configured on this device.")
    })?;
    let control = directory(&plan).map_err(|_| fail("The rental directory is unavailable."))?;
    if control.join("desktop-intent.json").exists() {
        return Err(fail(
            "This rental plan already has an attempt. Reconcile it before booking another.",
        ));
    }
    let credential = plan["credential_file"]
        .as_str()
        .ok_or_else(|| fail("Missing credential selection"))?;
    let account = plan["expected_account_id"]
        .as_u64()
        .ok_or_else(|| fail("Missing account selection"))?;
    let disk = plan["disk_gb"]
        .as_u64()
        .ok_or_else(|| fail("Missing disk selection"))?;
    let mut command = tokio::process::Command::new(cli);
    command
        .args([
            "prototype",
            "vast-quote",
            "--credential-file",
            credential,
            "--account",
            &account.to_string(),
            "--disk-gb",
            &disk.to_string(),
            "--offer",
            &req.offer_id.to_string(),
        ])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    if let Some(machine) = req.machine_id {
        command.args(["--machine", &machine.to_string()]);
    }
    let output = tokio::time::timeout(Duration::from_secs(25), command.output())
        .await
        .map_err(|_| fail("Offer qualification timed out."))?
        .map_err(|_| fail("Controller unavailable."))?;
    if !output.status.success() || output.stdout.len() > 32768 {
        return Err(fail(
            "This offer did not qualify for the Qwen 27B runtime, available budget, or empty account inventory. Choose another instance.",
        ));
    }
    let prices: Value =
        serde_json::from_slice(&output.stdout).map_err(|_| fail("Invalid quote."))?;
    if prices["offer_id"] != req.offer_id {
        return Err(fail("Selected offer changed."));
    }
    // vast-quote has just authenticated the account and verified complete empty
    // instance/volume inventories. Retain all prior monetary baseline amounts.
    plan["policy"]["baseline"]["external_liability"] = json!("NoneConfirmed");
    let estimate=quote_estimate(&plan,&prices,now()).map_err(|_|fail("The configured budget does not cover runtime, cleanup, transfer and contingency. Reconcile the rental plan before booking."))?;
    plan["offer_id"] = json!(req.offer_id);
    plan["offer_machine_id"] = json!(req.machine_id);
    let observed = now();
    let id = hex::encode(m8s_owner_identity::OwnerKeypair::generate().sign_bytes(b"m8s-quote/v1"));
    let cap = plan["policy"]["trial_all_in"].as_u64().unwrap()
        - plan["policy"]["baseline"]["prior_lifetime_spent"]
            .as_u64()
            .unwrap();
    *state.rentals.quote.lock().await = Some(Quote {
        id: id.clone(),
        target: target.clone(),
        plan,
        observed,
        prices: prices.clone(),
    });
    Ok(Json(
        json!({"quote_id":id,"target":target,"expires_at":observed+30,"cap_micro_usd":cap,"estimated_reserve_micro_usd":estimate,"prices":prices,"model":"Qwen 3.8 27B · UD-Q4_K_M"}),
    ))
}
pub async fn launch(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<LaunchRequest>,
) -> Result<Json<Value>, StatusCode> {
    authorize(&state, &headers)?;
    if crate::plugin_compute::configured() {
        let _lifecycle = state.lifecycle.lock().await;
        crate::plugin_compute::selected_target(&state)
            .await
            .map_err(|_| StatusCode::CONFLICT)?;
        return crate::plugin_compute::call(json!({"operation":"launch","quote_id":req.quote_id}))
            .await
            .map(Json)
            .map_err(|_| StatusCode::CONFLICT);
    }
    let _action = state.rentals.action.lock().await;
    let _lifecycle = state.lifecycle.lock().await;
    let mut quote_guard = state.rentals.quote.lock().await;
    let quote = quote_guard
        .as_ref()
        .filter(|q| q.id == req.quote_id && now() - q.observed <= 30)
        .ok_or(StatusCode::CONFLICT)?;
    let (active, _) = attachment::target(&state)
        .await
        .map_err(|_| StatusCode::CONFLICT)?;
    if active != quote.target {
        return Err(StatusCode::CONFLICT);
    }
    let (cli, configured) = config().map_err(|_| StatusCode::CONFLICT)?;
    let control = directory(&quote.plan).map_err(|_| StatusCode::CONFLICT)?;
    if directory(&configured).ok().as_ref() != Some(&control) {
        return Err(StatusCode::CONFLICT);
    }
    let mut plan = quote.plan.clone();
    let owner = state.attachment.get().ok_or(StatusCode::CONFLICT)?;
    let expires = now() + 1800;
    let capability = owner
        .grant(active.clone(), expires)
        .await
        .map_err(|_| StatusCode::CONFLICT)?;
    let bridge = control.join("attachment.json");
    write_new(
        &bridge,
        &json!({"port":state.ports.app,"capability":capability,"target":active}),
    )
    .map_err(|_| StatusCode::CONFLICT)?;
    plan["attachment"] = json!(bridge);
    let plan_path = control.join("attached-plan.json");
    write_new(&plan_path, &plan).map_err(|_| StatusCode::CONFLICT)?;
    // This immutable intent is the at-most-once boundary. Failure after it never
    // retries CREATE, including app restart or a lost HTTP response.
    write_new(&control.join("desktop-intent.json"),&json!({"target":active,"offer_id":plan["offer_id"],"prices":quote.prices,"expires_at":expires,"created_at":now()})).map_err(|_|StatusCode::CONFLICT)?;
    use std::os::unix::fs::OpenOptionsExt;
    let log = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(control.join("attached.log"))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut command = tokio::process::Command::new(cli);
    command
        .args(["prototype", "launch", "--plan"])
        .arg(plan_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(log)
        .kill_on_drop(false);
    let mut child = command
        .spawn()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    quote_guard.take();
    tokio::spawn(async move {
        let result = child.wait().await;
        let _ = write_new(
            &control.join("desktop-exit.json"),
            &json!({"finished_at":now(),"success":result.is_ok_and(|status|status.success())}),
        );
    });
    Ok(Json(json!({"accepted":true,"target":active})))
}
// Closed milestones only. Never forward native output, invites or provider errors.
fn progress_stage(bytes: &[u8]) -> &'static str {
    let Ok(log) = std::str::from_utf8(bytes) else {
        return "provisioning_or_running";
    };
    let has = |stage: &str| {
        log.lines()
            .any(|line| line.strip_prefix("prototype stage: ") == Some(stage))
    };
    if has("owner-routed-inference-completed") {
        "mesh_canary_completed"
    } else if has("owner-routed-model-observed") {
        "verifying_inference"
    } else if log
        .lines()
        .any(|line| line == "prototype native category: native-download-error")
    {
        "model_download_error"
    } else if has("certificate-delivered-control-established") {
        "preparing_model"
    } else if has("exact-instance-network-observed") {
        "provisioning_host"
    } else {
        "provisioning_or_running"
    }
}

pub async fn status() -> Json<Value> {
    if crate::plugin_compute::configured() {
        return Json(crate::plugin_compute::status().await.unwrap_or_else(|_|json!({"configured":true,"rental":null,"error":"Plugin status unavailable; cleanup is unconfirmed."})));
    }
    let Ok((_, plan)) = config() else {
        return Json(json!({"configured":false,"rental":null}));
    };
    let Ok(control) = directory(&plan) else {
        return Json(json!({"configured":false,"rental":null}));
    };
    let Ok(intent) = private_read(&control.join("desktop-intent.json")) else {
        return Json(json!({"configured":true,"rental":null}));
    };
    let attempt = plan["directory"].as_str().map(PathBuf::from);
    // The controller writes this evidence only after independent exact absence.
    let evidence = attempt
        .as_ref()
        .and_then(|p| private_read(&p.join("cleanup-evidence.json")).ok());
    let remote = attempt
        .as_ref()
        .and_then(|p| private_read(&p.join("desktop-node.json")).ok());
    let removed = evidence
        .as_ref()
        .zip(remote.as_ref())
        .is_some_and(|(receipt, node)| confirmed_removed(receipt, node, &plan));
    let finished = private_read(&control.join("desktop-exit.json")).is_ok();
    let progress = private_bytes(&control.join("attached.log"))
        .map(|bytes| progress_stage(&bytes))
        .unwrap_or("provisioning_or_running");
    Json(
        json!({"configured":true,"rental":{"target":intent["target"],"offer_id":intent["offer_id"],"node_id":remote.as_ref().and_then(|r|r["node_id"].as_str()),"instance_id":remote.as_ref().and_then(|r|r["instance_id"].as_u64()),"expires_at":intent["expires_at"],"stage":if removed{"removed"}else if finished {"cleanup_unconfirmed"}else if control.join("down-requested").exists(){"removal_requested"}else{progress}}}),
    )
}
pub async fn remove(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    authorize(&state, &headers)?;
    if crate::plugin_compute::configured() {
        return crate::plugin_compute::call(json!({"operation":"remove"}))
            .await
            .map(Json)
            .map_err(|_| StatusCode::CONFLICT);
    }
    let _action = state.rentals.action.lock().await;
    let (_, plan) = config().map_err(|_| StatusCode::CONFLICT)?;
    let control = directory(&plan).map_err(|_| StatusCode::CONFLICT)?;
    private_read(&control.join("desktop-intent.json")).map_err(|_| StatusCode::CONFLICT)?;
    if !control.join("down-requested").exists() {
        write_new(&control.join("down-requested"), &json!({"requested":true}))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(owner) = state.attachment.get() {
        owner.revoke().await;
    }
    Ok(Json(json!({"removal_requested":true,"removed":false})))
}

fn confirmed_removed(receipt: &Value, node: &Value, plan: &Value) -> bool {
    receipt["schema"] == "m8s.vast-removal/v1"
        && receipt["provider_confirmed_absent"] == true
        && receipt["image"] == plan["image"]
        && receipt["creator_account_id"] == plan["expected_account_id"]
        && receipt["instance_id"]
            .as_u64()
            .is_some_and(|id| id > 0 && node["instance_id"].as_u64() == Some(id))
}

pub async fn request_cleanup(state: &AppState) -> anyhow::Result<()> {
    if crate::plugin_compute::configured() {
        let status = crate::plugin_compute::call(json!({"operation":"status"})).await?;
        if status["attempt_consumed"] == true && status["provider_confirmed_removed"] != true {
            crate::plugin_compute::call(json!({"operation":"remove"})).await?;
        }
        return Ok(());
    }
    let _action = state.rentals.action.lock().await;
    if let Ok((_, plan)) = config() {
        let control = directory(&plan)?;
        if control.join("desktop-intent.json").exists() && !control.join("down-requested").exists()
        {
            write_new(&control.join("down-requested"), &json!({"requested":true}))?;
        }
    }
    Ok(())
}

impl Rentals {
    pub(crate) async fn invalidate_quote(&self) {
        self.quote.lock().await.take();
    }
}
pub(crate) fn provider_changes_allowed() -> bool {
    let plan = if let Some(path) = std::env::var_os("M8S_RENTAL_PLAN") {
        private_read(Path::new(&path))
    } else {
        crate::providers::generated_plan()
    };
    let Ok(plan) = plan else {
        return std::env::var_os("M8S_RENTAL_PLAN").is_none()
            && crate::providers::setup_without_plan_allowed();
    };
    let Ok(control) = directory(&plan) else {
        return false;
    };
    if !control.join("desktop-intent.json").exists() {
        return true;
    }
    let Some(attempt) = plan["directory"].as_str().map(PathBuf::from) else {
        return false;
    };
    private_read(&attempt.join("cleanup-evidence.json"))
        .ok()
        .zip(private_read(&attempt.join("desktop-node.json")).ok())
        .is_some_and(|(receipt, node)| confirmed_removed(&receipt, &node, &plan))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn progress_is_a_closed_projection_and_never_claims_remote_readiness() {
        assert_eq!(
            progress_stage(b"prototype native category: native-download-error\n"),
            "model_download_error"
        );
        assert_eq!(
            progress_stage(b"arbitrary native or provider text"),
            "provisioning_or_running"
        );
        assert_eq!(
            progress_stage(b"prototype stage: certificate-delivered-control-established\n"),
            "preparing_model"
        );
        assert_eq!(
            progress_stage(b"untrusted-prefix prototype stage: owner-routed-inference-completed"),
            "provisioning_or_running"
        );
        assert_eq!(
            progress_stage(b"prototype stage: owner-routed-inference-completed\n"),
            "mesh_canary_completed"
        );
    }
    #[test]
    fn quote_counts_cleanup_transfer_and_contingency_in_hourly_admission() {
        let mut plan = json!({"policy":{"max_runtime_seconds":1200,"minimum_cleanup_seconds":240,"minimum_contingency":1000000,"valid_from":1,"valid_until":10000,"trial_all_in":6000000,"monthly_all_in":6000000,"instance_hourly":3500000,"total_hourly":3500000,"baseline":{"prior_lifetime_spent":0,"prior_current_period_spent":0}},"request":{"quote":{"runtime_seconds":1200,"cleanup_seconds":240,"contingency":1000000}}});
        let prices = json!({"compute_micro_usd_per_hour":1500000,"storage_micro_usd_per_hour":20000,"transfer_micro_usd_per_gb":4000});
        assert!(quote_estimate(&plan, &prices, 100).is_err());
        plan["policy"]["instance_hourly"] = json!(18000000);
        plan["policy"]["total_hourly"] = json!(18000000);
        assert_eq!(quote_estimate(&plan, &prices, 100).unwrap(), 1864000);
        plan["policy"]["baseline"]["prior_lifetime_spent"] = json!(5000000);
        assert!(quote_estimate(&plan, &prices, 100).is_err());
    }
    #[test]
    fn removal_requires_exact_resource_account_and_explicit_absence() {
        let plan = json!({"image":"sha256:fixture","expected_account_id":7});
        let node = json!({"instance_id":8});
        let receipt = json!({"schema":"m8s.vast-removal/v1","provider_confirmed_absent":true,"image":"sha256:fixture","creator_account_id":7,"instance_id":8});
        assert!(confirmed_removed(&receipt, &node, &plan));
        for (field, value) in [
            ("instance_id", json!(9)),
            ("creator_account_id", json!(8)),
            ("image", json!("other")),
            ("provider_confirmed_absent", json!(false)),
        ] {
            let mut wrong = receipt.clone();
            wrong[field] = value;
            assert!(!confirmed_removed(&wrong, &node, &plan));
        }
        assert!(!confirmed_removed(&json!({"stopped":true}), &node, &plan));
    }
    #[test]
    fn durable_intent_cannot_be_overwritten_or_follow_a_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("intent.json");
        write_new(&path, &json!({"attempt":1})).unwrap();
        assert!(write_new(&path, &json!({"attempt":2})).is_err());
        assert_eq!(
            private_read(&path.canonicalize().unwrap()).unwrap()["attempt"],
            1
        );
        let link = dir.path().join("alias.json");
        std::os::unix::fs::symlink(&path, &link).unwrap();
        assert!(write_new(&link, &json!({"attempt":2})).is_err());
        assert!(private_read(&link).is_err());
    }
    #[test]
    fn rental_mutations_require_same_origin_non_simple_requests() {
        let state = AppState::new(crate::state::Ports {
            app: 4640,
            api: 9337,
            console: 3131,
        });
        let mut headers = HeaderMap::new();
        assert!(authorize(&state, &headers).is_err());
        headers.insert("x-m8s-desktop", "1".parse().unwrap());
        assert!(authorize(&state, &headers).is_ok());
        headers.insert("origin", "https://example.invalid".parse().unwrap());
        assert!(authorize(&state, &headers).is_err());
        headers.insert("origin", "http://127.0.0.1:4640".parse().unwrap());
        assert!(authorize(&state, &headers).is_ok());
    }
}
