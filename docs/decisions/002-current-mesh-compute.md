# ADR 002 — Current-mesh compute and local owner custody

Status: attachment and removal live demonstrated; inference not yet live qualified, 2026-10-29. Supersedes the dedicated
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
