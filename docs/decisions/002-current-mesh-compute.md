# ADR 002 — Current-mesh compute and local owner custody

Status: pinned stock-main token-only attachment, inference, app chat and removal
live verified, 2026-10-30. Supersedes the dedicated
owner-client topology for new desktop bookings; the older opt-in demo remains.

The desktop owns one embedded Mesh node, which can be a passive client or a
host. Its role does not grant provider authority. Each app installation uses an
explicit app-owned private owner keystore, supplied to the existing Mesh SDK.
The app never takes over another local process merely because it discovers it.

A reviewed rental attaches to the current mesh. The controller gets an expiring,
single-issuance capability in a private plan. The app checks the active node ID,
mesh ID, certificate ID and verified owner before returning its invite or signing
an exact remote-node certificate. Owner private material stays in the app. The
controller continues to burn its bootstrap nonce durably before requesting a
signature and verifies the returned canonical certificate. App restart destroys
all capabilities. A mesh change invalidates an existing quote or grant.

Provider credentials remain backend-only. Browsing is read-only; a listing and
model-size estimate are not launch qualification. A quote rechecks the exact
offer, account, empty resource inventory and the pinned Qwen 27B runtime's
requirements. Confirmation consumes an immutable, private desktop intent before
starting the controller. There is no automatic retry after an uncertain result.
The existing controller owns budget admission, independently surviving cleanup,
certificate verification and inference checks. Leaving the mesh requests cleanup.

The current integration deliberately admits one attempt per explicit rental
plan. It retains intent and accounting after removal or app restart. Repeating
rentals requires a newly reconciled plan; this is not yet a general fleet scheduler.
The experimental runtime currently supports Qwen 3.8 27B on qualified hardware;
other catalog model classes are capacity estimates, not additional runtime images.

Compute shows a discovery map, not invented peer-to-peer link topology. Physical,
reserved and allocatable VRAM are separate. Allocatable capacity is configuration,
not live free memory. Running, assigned and cached models are distinct; missing
telemetry is unknown. Live GPU utilization is not exposed by this SDK.

Validation and remaining work:
- Exact signer output is checked with the desktop SDK's canonical verifier.
- Stale mesh, browser-origin signing and replay are rejected by backend tests.
- Backend intent tests cover duplicate writes and symlinks.
- Browser tests cover hardware details, offer review, stale quotes and SVG clicks.
- Live instance 58294972 joined the existing private mesh, advertised its GPU and
  running model, and was inspected and removed through the native UI. Exact
  provider absence was confirmed at Unix 1793302220. The inference canary did
  not complete on this attempt; readiness remains unclaimed.
- A canary routed through an existing mesh can select another host of the same
  model. Exact remote-host readiness needs node-specific evidence; do not use a
  mesh-wide model listing alone as proof that the new rental is ready.
- Cross-attempt accounting and more model/runtime profiles remain explicit work.

Provider discovery also carries machine ID as a search hint. Fresh qualification
narrows by machine and still matches the exact selected offer; it never silently
substitutes a different offer. This avoids treating a bounded market sample as
complete inventory. Budget review includes cleanup, transfer and contingency
in its all-in hourly limit, before creating the desktop launch intent.

The live host preparation path currently exposes coarse startup milestones and
closed error categories, not download progress or live GPU utilization. Provider
container-running status is not inference readiness. Add bounded, redacted
progress/telemetry projection before treating this as a production fleet console.

Native validation exposed SDK-version differences in OpenAI model listing: the
controller now accepts only the pinned HF alias or its exact pinned native source
identity and sends the discovered identity, still requiring the exact native
identity in the completion response. No substring matching or arbitrary fallback.
Home records the verified active mesh ID separately from the invite: this SDK’s
invite contains a bootstrap node ID, not a mesh ID. Rotated invites group by the
saved mesh ID for display only. Equal names never merge unknown meshes.

Final 2026-10-29 validation: instance 58297997 authenticated successfully but
reported a native model-download error and never joined as a serving peer. It
was removed through the desktop removal API; exact absence was confirmed at Unix
1793303179. A targeted retry of the first machine refused during fresh offer
qualification, before launch intent or CREATE. Final inventory at Unix 1793303306
was zero instances and zero volumes. Current-mesh inference remains unqualified;
the corrected exact-ID discovery needs a successful live completion. Retain both
unsettled reservations. Do not label the current-mesh demo fully ready yet.

Rental status now projects only closed startup milestones and a download-error
label; it never forwards native log lines. A completed mesh-wide canary is labeled
“Mesh inference verified”, not proof of readiness of an arbitrary new host.


### Worker startup observations

Plugin-backed rentals may display fresh, resource-bound worker observations
while token provisioning is pending. Cache size and received bytes are counters,
not download completion or inference readiness. Even a matching worker-reported
mesh identity remains explicitly “inference not yet verified” until the existing
owner-routed canary succeeds. Remove compute remains available during startup.
The restricted SSH status command grants no interactive terminal access.


### Upstream owner-control relay collision

Live stock-worker testing exposed a relay collision in embedded upstream
b4b33ef8: the main mesh endpoint and owner-control listener share an endpoint ID
and both register with the relay. The relay evicts the main connection. Local
admission can pass while remote joining fails. The fix already exists in stock
main 280944334: keep owner-control on its direct endpoint and retain the main
mesh relay registration. Use that stock upstream revision rather than removing owner authentication or
changing TLS/relay admission policy. Remote acceptance still requires a new
bounded test; a source change is not evidence of successful inference.


Directly upgrading the embedded SDK fails dependency resolution: current Mesh's
rusqlite and pinned Goose's sqlx require incompatible native SQLite libraries.
Keep the existing embedded SDK for the ordinary app. Explicit v0 runs may set
`M8S_STOCK_MESH` to an owned stock-main executable alongside `M8S_PLUGIN`.
The app starts and owns this passive local process, using its existing device
owner key and `--owner-required`; invite material travels only through private
files. HTTP status, inference and plugin target checks address that process.
No Mesh fork or authentication downgrade is introduced.

This profile supports creating a private passive mesh or joining a private
invite as a passive client. It refuses public discovery and local model serving
rather than silently switching runtimes. Startup is bounded, occupied ports are
refused, and shutdown stops/reaps the owned child after rental cleanup. Private
session logs and node material remain local; the temporary join file is removed.
The child does not inherit provider credentials or the parent's environment.


Follow-up: normal shutdown and task cancellation own/reap the child; abrupt
termination of the entire app process is not yet covered by an independent
local-node supervisor. Do not infer that local process absence proves rental
removal. The existing rental watchdog and retained-liability rules remain the
financial cleanup authority.


### Stock-main acceptance, 2026-10-30

The explicit stock process mode and shared plugin adapter completed the real
selected-mesh rental, owner-routed canary, two app chat turns and independent
provider absence check. A single supervised download-recovery restart retained
worker identity and the original deadline. See [acceptance](../V0_ACCEPTANCE.md)
for exact pins and admission limits. Earlier unsuccessful attempts above remain
historical evidence. The recording discloses transient stale peer discovery after
removal; live GPU utilization and owner-certified rental admission remain open.
