//! A narrow local owner bridge. The controller receives one expiring grant;
//! owner keys never leave this backend. Grants bind the active mesh and node.
use crate::state::{AppState, Phase};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use m8s_owner_identity::{
    OwnerKeypair,
    exact_node_signing::{ExactNodeSigningRequest, ExactSigningPolicy, sign_node_ownership_exact},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc, time::Duration};
use tokio::sync::Mutex;

pub struct Attachment {
    key: OwnerKeypair,
    pub key_path: PathBuf,
    grants: Mutex<Vec<Grant>>,
}
struct Grant {
    capability: String,
    target: Target,
    expires_at: i64,
    consumed: bool,
}
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
    pub node_id: String,
    pub mesh_id: String,
    pub cert_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BridgeRequest {
    pub operation: String,
    pub node: Option<[u8; 32]>,
    pub issued_at: Option<i64>,
    pub expires_at: Option<i64>,
}
fn now() -> i64 {
    chrono::Utc::now().timestamp()
}
impl Attachment {
    pub fn open() -> anyhow::Result<Self> {
        let root = std::env::var_os("GOOSE_PATH_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                dirs::data_dir()
                    .expect("app data directory")
                    .join("m8s-app/goose")
            })
            .join("compute-owner");
        Self::open_at(root)
    }
    fn open_at(root: PathBuf) -> anyhow::Result<Self> {
        use std::os::unix::fs::{DirBuilderExt, MetadataExt};
        if !root.exists() {
            std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(&root)?;
        }
        let metadata = std::fs::symlink_metadata(&root)?;
        anyhow::ensure!(
            metadata.uid() == unsafe { libc::geteuid() }
                && metadata.is_dir()
                && metadata.mode() & 0o077 == 0
                && root.canonicalize()? == root,
            "Invalid owner directory"
        );
        let key_path = root.join("owner.json");
        if !key_path.exists() {
            m8s_owner_identity::save_keystore(&key_path, &OwnerKeypair::generate(), None, false)?;
        }
        let metadata = std::fs::symlink_metadata(&key_path)?;
        anyhow::ensure!(
            metadata.uid() == unsafe { libc::geteuid() }
                && metadata.nlink() == 1
                && metadata.is_file()
                && metadata.mode() & 0o077 == 0
                && key_path.canonicalize()? == key_path,
            "Invalid owner file"
        );
        let key = m8s_owner_identity::load_keystore(&key_path, None)?;
        Ok(Self {
            key,
            key_path,
            grants: Mutex::new(Vec::new()),
        })
    }
    /// Called only by the backend after a reviewed booking is admitted. The
    /// capability is written to the private launch plan, never sent to the UI.
    pub async fn grant(&self, target: Target, expires_at: i64) -> anyhow::Result<String> {
        anyhow::ensure!(
            expires_at > now() && expires_at <= now() + 1800,
            "Invalid grant lifetime"
        );
        let capability =
            hex::encode(OwnerKeypair::generate().sign_bytes(b"m8s-current-mesh-grant/v1"));
        let mut grants = self.grants.lock().await;
        grants.retain(|grant| grant.expires_at > now());
        anyhow::ensure!(grants.is_empty(), "An attachment grant is already active");
        grants.push(Grant {
            capability: capability.clone(),
            target,
            expires_at,
            consumed: false,
        });
        Ok(capability)
    }
    pub async fn revoke(&self) {
        self.grants.lock().await.clear();
    }
}

pub async fn target(state: &AppState) -> anyhow::Result<(Target, Value)> {
    anyhow::ensure!(
        matches!(state.phase().await, Phase::Running(_)),
        "Mesh is not running"
    );
    let attachment = state
        .attachment
        .get()
        .ok_or_else(|| anyhow::anyhow!("Owner is not initialized"))?;
    let response = state
        .http
        .get(format!(
            "http://127.0.0.1:{}/api/status",
            state.ports.console
        ))
        .timeout(Duration::from_secs(2))
        .send()
        .await?
        .error_for_status()?;
    let bytes = response.bytes().await?;
    anyhow::ensure!(bytes.len() <= 1024 * 1024, "Status too large");
    let status: Value = serde_json::from_slice(&bytes)?;
    anyhow::ensure!(
        status["owner"]["verified"] == true
            && status["owner"]["owner_id"].as_str() == Some(attachment.key.owner_id().as_str()),
        "Active node owner does not match the app"
    );
    let field = |value: &Value| {
        value
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 256)
            .map(str::to_owned)
            .ok_or_else(|| anyhow::anyhow!("Missing mesh identity"))
    };
    Ok((
        Target {
            node_id: field(&status["node_id"])?,
            mesh_id: field(&status["mesh_id"])?,
            cert_id: field(&status["owner"]["cert_id"])?,
        },
        status,
    ))
}

pub async fn bridge(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<BridgeRequest>,
) -> Result<Json<Value>, StatusCode> {
    // The capability is never browser-readable. There is no CORS grant. Even
    // same-origin JS cannot mint a certificate without the private launch grant.
    if headers.contains_key("origin") {
        return Err(StatusCode::FORBIDDEN);
    }
    let capability = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(StatusCode::FORBIDDEN)?;
    let _lifecycle = state.lifecycle.lock().await;
    let attachment = state.attachment.get().ok_or(StatusCode::CONFLICT)?;
    let mut grants = attachment.grants.lock().await;
    let grant = grants
        .iter_mut()
        .find(|g| g.capability == capability && g.expires_at > now())
        .ok_or(StatusCode::FORBIDDEN)?;
    let (active, status) = target(&state).await.map_err(|_| StatusCode::CONFLICT)?;
    if active != grant.target {
        return Err(StatusCode::CONFLICT);
    }
    match request.operation.as_str() {
        "attach" => {
            let token = status["token"]
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 16384)
                .ok_or(StatusCode::CONFLICT)?;
            Ok(Json(
                json!({"target":active,"api_port":state.ports.api,"console_port":state.ports.console,
                "owner_id":attachment.key.owner_id(),"owner_signing_key":hex::encode(attachment.key.verifying_key().as_bytes()),
                "expires_at":grant.expires_at,"invite":token}),
            ))
        }
        "sign" => {
            if grant.consumed {
                return Err(StatusCode::CONFLICT);
            }
            let issued = request.issued_at.ok_or(StatusCode::BAD_REQUEST)?;
            let expires = request.expires_at.ok_or(StatusCode::BAD_REQUEST)?;
            if issued <= 0 || expires > grant.expires_at {
                return Err(StatusCode::FORBIDDEN);
            }
            let request = ExactNodeSigningRequest::new(
                request.node.ok_or(StatusCode::BAD_REQUEST)?,
                u64::try_from(issued)
                    .ok()
                    .and_then(|v| v.checked_mul(1000))
                    .ok_or(StatusCode::BAD_REQUEST)?,
                u64::try_from(expires)
                    .ok()
                    .and_then(|v| v.checked_mul(1000))
                    .ok_or(StatusCode::BAD_REQUEST)?,
            )
            .map_err(|_| StatusCode::BAD_REQUEST)?;
            // Burn before signing. Restart loses all grants, so a crash cannot
            // re-enable issuance. The controller's nonce ledger is independent.
            grant.consumed = true;
            let policy = ExactSigningPolicy::new(1_800_000, 5000)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let certificate = sign_node_ownership_exact(&attachment.key, &request, &policy)
                .map_err(|_| StatusCode::FORBIDDEN)?;
            Ok(Json(json!({"certificate":certificate})))
        }
        _ => Err(StatusCode::BAD_REQUEST),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{Mode, Ports, RunningInfo, Visibility};
    #[tokio::test]
    async fn bridge_rejects_stale_mesh_origin_and_replay_and_preserves_exact_claims() {
        let temporary = tempfile::tempdir().unwrap();
        let owner =
            Attachment::open_at(temporary.path().canonicalize().unwrap().join("owner")).unwrap();
        let owner_id = owner.key.owner_id();
        let target = Target {
            node_id: "local-node".into(),
            mesh_id: "mesh-a".into(),
            cert_id: "local-cert".into(),
        };
        let live = Arc::new(Mutex::new(
            json!({"node_id":target.node_id,"mesh_id":target.mesh_id,"owner":{"verified":true,"owner_id":owner_id,"cert_id":target.cert_id},"token":"synthetic-invite"}),
        ));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let data = live.clone();
        let task = tokio::spawn(async move {
            axum::serve(
                listener,
                axum::Router::new().route(
                    "/api/status",
                    axum::routing::get(move || {
                        let data = data.clone();
                        async move { Json(data.lock().await.clone()) }
                    }),
                ),
            )
            .await
            .unwrap()
        });
        let state = AppState::new(Ports {
            app: 4640,
            api: 9337,
            console: port,
        });
        assert!(state.attachment.set(owner).is_ok());
        state
            .set_phase(Phase::Running(RunningInfo {
                mode: Mode::Host,
                visibility: Visibility::Private,
                model: None,
                serving: false,
                invite_token: None,
                api_port: 9337,
                console_port: port,
                mesh_name: None,
            }))
            .await;
        let owner = state.attachment.get().unwrap();
        let cap = owner.grant(target.clone(), now() + 120).await.unwrap();
        let mut headers = HeaderMap::new();
        headers.insert("authorization", format!("Bearer {cap}").parse().unwrap());
        let request = || {
            Json(BridgeRequest {
                operation: "sign".into(),
                node: Some([7; 32]),
                issued_at: Some(now()),
                expires_at: Some(now() + 60),
            })
        };
        let mut browser = headers.clone();
        browser.insert("origin", "http://127.0.0.1:4640".parse().unwrap());
        assert_eq!(
            bridge(State(state.clone()), browser, request())
                .await
                .unwrap_err(),
            StatusCode::FORBIDDEN
        );
        live.lock().await["mesh_id"] = json!("mesh-b");
        assert_eq!(
            bridge(State(state.clone()), headers.clone(), request())
                .await
                .unwrap_err(),
            StatusCode::CONFLICT
        );
        live.lock().await["mesh_id"] = json!("mesh-a");
        let issued = now();
        let expires = issued + 60;
        let response = bridge(
            State(state.clone()),
            headers.clone(),
            Json(BridgeRequest {
                operation: "sign".into(),
                node: Some([7; 32]),
                issued_at: Some(issued),
                expires_at: Some(expires),
            }),
        )
        .await
        .unwrap();
        let certificate: mesh_llm_host_runtime::crypto::SignedNodeOwnership =
            serde_json::from_value(response.0["certificate"].clone()).unwrap();
        assert_eq!(certificate.claim.issued_at_unix_ms, issued as u64 * 1000);
        assert_eq!(certificate.claim.expires_at_unix_ms, expires as u64 * 1000);
        let verified = mesh_llm_host_runtime::crypto::verify_node_ownership(
            Some(&certificate),
            &[7; 32],
            &Default::default(),
            mesh_llm_host_runtime::crypto::TrustPolicy::Off,
            issued as u64 * 1000,
        );
        assert!(verified.verified);
        assert_eq!(
            bridge(State(state.clone()), headers, request())
                .await
                .unwrap_err(),
            StatusCode::CONFLICT
        );
        task.abort();
    }
}
