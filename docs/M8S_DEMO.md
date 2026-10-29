# Bounded Qwen 27B desktop demo

The adapter is ported from the earlier desktop demo. This fork has not yet
completed a live GPU run; synthetic screenshots are not live evidence.

This branch adds an opt-in **Private GPU demo** screen to the Tauri app. It uses
m8s's certified, model-free owner client, the existing Chat renderer and the live
mesh sidebar. It creates a dedicated demo network; it does not add a rental to
an arbitrary pre-existing desktop network.

The normal embedded-node and Goose flows remain available when demo mode is not
configured. Demo chat is a bounded, plain conversation through the pinned Qwen
model, with history held in memory. It does not invoke Goose tools. Answers are
displayed after the complete response and exact response-model validation.

## Prepare

Use the m8s repository's Qwen runbook to qualify the pinned native client and
image, account for prior spending/liabilities, and prepare a fresh private plan.
This desktop adapter permits at most USD5 of new allowance; the underlying plan
and m8s admission may impose a smaller limit. A cap is not a final bill.

The plan’s `instance_hourly` and `total_hourly` caps apply to the all-in
amortized rate, including transfer, contingency and cleanup. They must cover
that rate as well as the GPU’s advertised hourly price. The total new allowance
remains independently bounded by the trial cap minus the retained baseline.

The m8s CLI must include `m8s.desktop-owner/v1` attachment export. Start the
one-attempt daemon with the selected plan before opening the app:

```sh
/absolute/m8sd --vast-demo --state-dir /absolute/private/CONTROL \
  --plan /absolute/private/plan.json --m8s /absolute/m8s
```

This initializes the control socket and frozen plan but does not rent anything.
Create a mode-0600 JSON config inside a mode-0700 directory:

```json
{
  "cli": "/absolute/m8s",
  "control_directory": "/absolute/private/CONTROL"
}
```

Run the desktop with that explicit config (and an isolated Goose data directory):

```sh
M8S_DESKTOP_CONFIG=/absolute/private/desktop.json \
GOOSE_PATH_ROOT=/absolute/private/goose \
CARGO_BUILD_JOBS=2 bin/just run
```

`Add compute` requests one `m8s up qwen38-27b`. The coordinator authenticates its
local client, publishes only public identity and local ports in a private
attachment file, then performs the existing bounded provisioning workflow.
Credentials and private keys never enter the WebView. The adapter refuses
attachment files with unsafe modes, aliases or wrong ownership. It checks the
live owner's certificate identity and model-free role before exposing the node.

## Recording

1. From Fleet choose **Open rental session**, then show the cap and choose
   **Add compute · Qwen 27B**. The recorder opens `?view=rental-demo` directly.
2. Show the local certified client and GPU peer as observed; loading remains
   distinct from Ready. Ready requires the actual coordinator canary, exact
   model discovery and a live verified owner client.
3. Ask “Explain a mesh network in two sentences.” Follow with “How does adding
   this GPU help my laptop?” The backend preserves both turns and pins requests
   and responses to the exact model identities qualified by m8s.
4. Choose **Remove compute**. Wait for **GPU removed · provider confirmed**.
   This requires the coordinator's exact-absence event and matching private
   provider-removal receipt. Down acknowledgement alone is not removal.
5. Independently verify final provider inventories using the m8s runbook. Retain
   accounting journals and reservations. Capture only the dedicated app window.

Closing the desktop requests down; the m8s coordinator and independent watchdog
retain the original deadline even if the desktop crashes. Do not stop those
processes as a substitute for verified destruction. A consumed launch cannot be
replayed; a replacement needs a new admitted plan and confirmed prior absence.

## Validation

Run `cargo test --locked -j2 -p mesh-console`, strict Clippy, formatting, UI lint,
UI build and the mocked Playwright suite. Synthetic tests cover budget bounds,
identity/model substitution, private attachment files, stale readiness, and
removal confirmation. Mocked tests are rehearsal, not live GPU evidence.

To record the live frontend against the running desktop backend without macOS
screen-capture permission, use the manual browser recorder (this performs the
paid Add compute action):

```sh
node scripts/record-m8s.mjs --live --url http://127.0.0.1:4640 \
  --output /absolute/new-private-recording-directory
```

It saves an uncut WebM, screenshots, a timeline and the two-turn conversation.
The capture uses the actual desktop frontend and backend, without the native
window frame. It requests down on failure and reports failure if removal cannot
be confirmed; independently verify the provider inventories afterward.

## Current-mesh rentals (experimental)

New Compute bookings use the currently attached embedded node. Start the app with
`M8S_CLI` pointing to an absolute, locally owned `m8s` executable built with
`prototype-vast`, `M8S_VAST_CREDENTIAL_FILE` pointing to the explicitly selected
private dotenv file, and `M8S_RENTAL_PLAN` pointing to a private bounded launch
plan. The plan uses the controller's `m8s.vast-demo/v1` schema, Qwen 3.8 27B model,
and a fresh private `control_directory`. Preserve cumulative budget liabilities;
do not reuse consumed attempts. The app writes its attachment descriptor and
immutable intent there. Never place these files in the repository.

Create or join a mesh, then open Compute → Add compute. Browse hardware, inspect
per-GPU memory and approximate model classes, review an instance, and request a
fresh qualification. Confirm rental only after reviewing the budget and target.
The current runtime qualification supports Qwen 27B on its pinned Blackwell image;
browsing other hardware does not mean that runtime can launch on it.

Owned rentals show removal requests separately from confirmed removal. Select a
discovered node or use Inspect node on its rental to view reported GPU capacity,
running/assigned/cached models and identity. Missing live utilization stays unknown.
Leaving the mesh requests removal; independent provider cleanup still enforces the
bounded deadline if the app exits. Keep the private controller state for recovery.
The UI currently allows one attempt per reconciled plan, not automatic repeat
booking. See ADR 002 for the architecture and qualification gaps.

## Connect a provider in the app

Open Compute → Providers → Connect Vast (or Settings → Manage compute providers).
Choose Get a Vast API key, create a key with account and instance-management access,
paste it into the password field, and select Verify & connect. This verifies the
account without creating a rental. You can verify, replace or disconnect the key
later; replacement/disconnect waits for any managed rental's confirmed cleanup.
The key stays in private local app storage and is not shown again.

New setups with the m8s controller installed receive a bounded one-attempt profile
automatically. Existing `M8S_RENTAL_PLAN` profiles retain their account and accounting;
the setup key must belong to that account. Browsing is separate from billing:
a fresh quote and explicit budget confirmation are still required to rent.
Consumed plans remain consumed after key replacement or disconnect. Nebius is a
coming-soon card, not a working adapter.

Owned rentals offer Open Vast console, Copy instance ID and Connection details,
in addition to node inspection and removal. The current managed runtime has no
interactive SSH or pause/resume. Its provisioning key cannot open a shell. Use
Remove compute to release the rental and wait for provider-confirmed removal.
See [ADR 003](decisions/003-provider-onboarding.md) for custody and lifecycle details.

## Current-mesh showcase recording

The compact Fleet UI uses a separate live recorder:

```sh
node scripts/record-fleet.mjs --live /absolute/new-private-output
node scripts/edit-fleet.mjs /absolute/new-private-output
```

The app must already have a passive private mesh (owner-verified for certified
mode), no remote peers, and
an unused, explicitly reconciled rental plan. The recorder browses actual offers,
checks a fresh quote (at most USD6), confirms once, waits for the controller's
real inference canary, inspects hardware, asks two questions in Chat, and requests
removal. It never installs mock responses. Independent controller cleanup remains
armed if capture fails. `M8S_RECORD_SKIP_OFFERS` can exclude comma-separated stale
offer IDs from selection; it never bypasses fresh qualification.

The editor refuses unsuccessful captures. It produces a 67-second MP4 and a
30-second GIF, shortening waits and retaining readable answers, with explicit
editorial title cards and a live-recording disclosure. Keep the uncut WebM and
private attempt/accounting evidence locally; publish only reviewed media and
sanitized receipts. A failed run must not replace the existing successful demo.

Recording exposed a remaining status issue: a controller failure during final
preflight, before budget reservation or CREATE, currently appears as cleanup
pending. Preserve its immutable attempt, verify the failure boundary and fresh
empty provider inventories, then select a separately reconciled plan. Do not
reset the old intent or fabricate a provider-removal receipt for a nonexistent
instance. A dedicated pre-CREATE failure projection remains follow-up work.

## Stock-Mesh v0 adapter (qualification pending)

Set `M8S_PLUGIN` to the absolute, owned `m8s-plugin` executable and inherit
`M8S_CLI` plus `M8S_V0_PLAN` when launching the app. The plan and target files
must be private and explicitly select `token-only-provider-trusted` admission.
See the plugin repository's `docs/V0_TOKEN_JOIN.md` for the plan and worker
requirements. The selected node/mesh must match the app's current attachment.

Offers, quotes, launch, status and removal then use the same `m8s.operator/v0`
implementation as Mesh's plugin tool. Provider credentials come from the selected
private plan; the Providers tab cannot replace them in this mode. A failed plugin
operation does not fall back to the historical launcher.

Token-only admission does not verify an owner-issued worker certificate. The
provider can inspect the worker's join token and inference data. The current app
still embeds upstream `b4b33ef8`; this adapter alone does not prove compatibility
with the latest main runtime. The README architecture cover is a preview, and
no new live demo has passed the stock-Mesh acceptance gates yet.

The recorder recognizes token-mode readiness separately and records its admission
mode. The editor labels token-mode footage explicitly; this tooling has syntax
checks, but no successful stock-v0 capture yet.
