use axum::{Json, extract::State, http::HeaderMap};
use mesh_console::{
    providers,
    state::{AppState, Ports},
};
use std::os::unix::fs::PermissionsExt;
#[tokio::test]
async fn private_provider_selection_never_exposes_keys_and_disconnect_does_not_fall_back() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    unsafe {
        std::env::set_var("GOOSE_PATH_ROOT", &root);
        std::env::remove_var("M8S_RENTAL_PLAN");
        std::env::set_var("M8S_VAST_CREDENTIAL_FILE", root.join("external.env"));
    }
    let dir = root.join("providers");
    std::fs::create_dir(&dir).unwrap();
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    let key = dir.join("test.env");
    std::fs::write(&key, "VAST_API_KEY=synthetic-private-key\n").unwrap();
    std::fs::set_permissions(&key, std::fs::Permissions::from_mode(0o600)).unwrap();
    std::fs::write(
        root.join("external.env"),
        "VAST_API_KEY=synthetic-external-key\n",
    )
    .unwrap();
    let profile = dir.join("historical-plan.json");
    std::fs::write(&profile,serde_json::to_vec(&serde_json::json!({"expected_account_id":42,"control_directory":dir.join("managed-42"),"directory":dir.join("managed-42/attempt"),"image":"ghcr.io/joabzzz/m8s-prototype@sha256:5266fe6e7e824cd4e343b084d74c9b251cdec130d12b72fbb8349f940f8048a6","policy":{"baseline":{"prior_lifetime_spent":1234567}}})).unwrap()).unwrap();
    std::fs::set_permissions(&profile, std::fs::Permissions::from_mode(0o600)).unwrap();
    let settings = dir.join("vast.json");
    std::fs::write(
        &settings,
        serde_json::to_vec(
            &serde_json::json!({"account_id":42,"credential_file":key,"verified_at":123,"rental_plan":profile,"controller_file":"/synthetic/controller"}),
        )
        .unwrap(),
    )
    .unwrap();
    std::fs::set_permissions(&settings, std::fs::Permissions::from_mode(0o600)).unwrap();
    let status = providers::status().await.unwrap().0;
    assert_eq!(status["vast"]["account_id"], 42);
    assert_eq!(status["vast"]["configured"], true);
    assert!(!status.to_string().contains("private-key"));
    assert!(!status.to_string().contains("test.env"));
    let state = AppState::new(Ports {
        app: 4640,
        api: 9337,
        console: 3131,
    });
    assert!(
        providers::disconnect(State(state.clone()), HeaderMap::new())
            .await
            .is_err()
    );
    let mut headers = HeaderMap::new();
    headers.insert("x-m8s-desktop", "1".parse().unwrap());
    let managed = dir.join("managed-42");
    std::fs::create_dir(&managed).unwrap();
    std::fs::set_permissions(&managed, std::fs::Permissions::from_mode(0o700)).unwrap();
    let write = |path: &std::path::Path, value: serde_json::Value| {
        std::fs::write(path, serde_json::to_vec(&value).unwrap()).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
    };
    write(
        &managed.join("identity.json"),
        serde_json::json!({"owner":"m8s-desktop-0123456789abcdef0123456789abcdef"}),
    );
    write(
        &managed.join("desktop-intent.json"),
        serde_json::json!({"retained":true}),
    );
    assert!(
        providers::disconnect(State(state.clone()), headers.clone())
            .await
            .is_err()
    );
    assert!(key.exists());
    let attempt = managed.join("attempt");
    std::fs::create_dir(&attempt).unwrap();
    let image = "ghcr.io/joabzzz/m8s-prototype@sha256:5266fe6e7e824cd4e343b084d74c9b251cdec130d12b72fbb8349f940f8048a6";
    write(
        &attempt.join("desktop-node.json"),
        serde_json::json!({"instance_id":8}),
    );
    let mut receipt = serde_json::json!({"schema":"m8s.vast-removal/v1","image":image,"creator_account_id":42,"instance_id":9,"provider_confirmed_absent":true});
    write(&attempt.join("cleanup-evidence.json"), receipt.clone());
    assert!(
        providers::disconnect(State(state.clone()), headers.clone())
            .await
            .is_err()
    );
    receipt["instance_id"] = serde_json::json!(8);
    write(&attempt.join("cleanup-evidence.json"), receipt);
    let Json(result) = providers::disconnect(State(state.clone()), headers.clone())
        .await
        .unwrap();
    assert_eq!(result["disconnected"], true);
    let retained: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&settings).unwrap()).unwrap();
    assert_eq!(retained["rental_plan"], profile.to_string_lossy().as_ref());
    assert_eq!(retained["controller_file"], "/synthetic/controller");
    let plan: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&profile).unwrap()).unwrap();
    assert_eq!(plan["policy"]["baseline"]["prior_lifetime_spent"], 1234567);
    assert!(!key.exists());
    assert!(managed.join("desktop-intent.json").exists());
    assert!(root.join("external.env").exists());
    assert_eq!(
        providers::status().await.unwrap().0["vast"]["configured"],
        false
    );
    headers.insert("origin", "https://untrusted.invalid".parse().unwrap());
    assert!(providers::verify(State(state), headers).await.is_err());
}
