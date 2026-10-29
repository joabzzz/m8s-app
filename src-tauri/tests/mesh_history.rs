use axum::{Json, extract::State};
use mesh_console::meshes::{SavedMesh, remember_mesh, saved_meshes};
use mesh_console::state::{AppState, Ports};

#[tokio::test]
async fn reconnect_history_survives_reads_and_rejects_invalid_invites() {
    let root = tempfile::tempdir().unwrap();
    // This integration test is the only test in its process.
    unsafe { std::env::set_var("GOOSE_PATH_ROOT", root.path()) };
    let state = AppState::new(Ports {
        app: 4640,
        api: 9337,
        console: 3131,
    });
    let entry = || {
        serde_json::from_value::<SavedMesh>(serde_json::json!({
            "name":"Global mesh", "config":{"kind":"public","share":false,"model":null}
        }))
        .unwrap()
    };
    let _ = remember_mesh(State(state.clone()), Json(entry()))
        .await
        .unwrap();
    let _ = remember_mesh(State(state.clone()), Json(entry()))
        .await
        .unwrap();
    let rows = saved_meshes().await.0;
    assert_eq!(rows.len(), 1);
    use std::os::unix::fs::PermissionsExt;
    assert_eq!(
        std::fs::metadata(root.path().join("meshes.json"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    let invalid = serde_json::from_value::<SavedMesh>(serde_json::json!({"name":"Bad", "config":{"kind":"join","token":"bad", "share":false,"model":null}})).unwrap();
    assert!(
        remember_mesh(State(state.clone()), Json(invalid))
            .await
            .is_err()
    );
    assert_eq!(saved_meshes().await.0.len(), 1);
}
