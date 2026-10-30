# Stock-Mesh v0 live acceptance — 2026-10-30

A real app run completed provider browsing, a fresh budgeted quote, one Vast
rental attached to the selected private mesh, owner-routed inference, two app
chat turns and provider-confirmed destruction. A separate fresh provider query
confirmed complete empty instance and volume inventories afterward.

## Reproducible pins

- Unmodified Mesh main: `2809443345ea8134db62a8b433f5bb2bb5f1d123`, reporting
  `0.78.0+g280944`, used by both the app-owned passive client and remote worker.
- Worker: `ghcr.io/joabzzz/m8s-prototype@sha256:35f7b629876cc888f951410485012799cb2c2fc4ca928a07f51aa531526e26e9`.
- Stock Linux CUDA product SHA-256:
  `6ec6f1e1c763ee49731fba1910878018c15e5b1ed7295ccf4634c5d8177150b1`;
  native ABI `0.1.74`, CUDA 12, SM120, NCCL disabled through the upstream build option.
- Model: `unsloth/Qwen3.8-27B-GGUF@4ca720788d1e01f1bff70c033e0d0028fd02e502/Qwen3.8-27B-UD-Q4_K_M.gguf`.
  Artifact: 16,464,440,224 bytes; SHA-256
  `322e194ff79741c7baa497c240f677f54b201b0efab44ca8e50f122b39123482`.
- Hardware: one NVIDIA RTX PRO 6000 Blackwell Workstation Edition.

## What passed

The client was passive and had no local model. The worker retained the same node
identity through one bounded download-recovery restart and resumed its partial
cache. It reported one hosted model. The canary completed through the owner and
matched the expected remote node and native model identity. The app then answered
“Explain a mesh network in two sentences” and “How does a remote GPU on this mesh
help my laptop?” The UI reported about 60–61 tokens/second for these two turns;
this is an observation, not a benchmark guarantee.

Removal was recorded by the controller and its independent watchdog, followed
by the separate empty-inventory check. Accounting retains the $1.981187 uncertain
reservation; that is a conservative liability reservation, not a settled invoice.
The raw recording, receipts, inventory observation and accounting journals are
preserved privately. No operational account/resource IDs, invites, keys or
machine-local paths are included in this summary. Git history was not rewritten.

## Security and limits

Admission was **token-only, provider-trusted**, with `certificate_verified: false`.
The join token traveled over host-key-verified SSH. This is not owner-certified
worker admission: the provider can inspect the token, worker memory and inference
data. Owner certificate issuance remains [issue #1](https://github.com/Mesh-LLM/m8s-plugin/issues/1).
The app's local owner identity being verified does not certify the rented worker.

This verifies one bounded rental and the exact pinned binaries/image. It does not
qualify every future main commit, provider, GPU or model. General repeat bookings,
multiple concurrent rentals, pause/resume, an unrestricted SSH terminal and live
GPU utilization remain outside this demo. The selected-mesh plugin adapter uses
an explicitly prepared private plan; its provider credentials are configured
outside the app. Mesh discovery briefly retained the removed peer after provider
absence; the video discloses that lag instead of fabricating a refreshed screen.

## Reviewed media and checks

[One-minute MP4](assets/qwen27-demo.mp4) · [30-second GIF](assets/qwen27-demo.gif)

The footage uses the real UI and responses. Startup/response waits are shortened;
editorial title cards and identifier redactions are disclosed. The cover is a
frame from the reviewed chat footage. Raw operational evidence is not committed.

Validation: full serial `scripts/check`, strict workspace/plugin Clippy, 53
container tests, seven plugin tests, UI lint/build and 52 mocked browser tests.
The exact worker also passed SSH refusal, cancellation, deadline and anonymous
image-pull checks. Local tests alone were not substituted for live acceptance.
