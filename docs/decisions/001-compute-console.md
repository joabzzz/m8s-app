# 001: Compute-focused experimental desktop

Accepted direction, 2026-10-29. Fork: joabzzz/m8s-app.

Retain desktop-app's visual system, themes and agent chat. Add an operator
workspace for Fleet, Providers and Inference. Use the existing HTTP/SSE boundary
for backend communication. m8sd owns rentals, secrets, policy and durable state;
the desktop is a client. Closing its window must not strand rented resources.

Show remote capacity as reported, inference throughput only when measured, and
unknown cost as unknown. Never label an arbitrary mesh peer as an owned rental.
A provider connection is distinct from a mesh connection. Vast is the first
qualified provider; Nebius remains a future adapter.

The first integration must reconcile the current embedded Mesh SDK with the
certificate-enforcing runtime used in the m8s demo. See m8s P005 for outstanding
signing, offer API, metrics, release and teardown acceptance.

Desktop packaging is for local tests and GIF capture; no signed public release
or updater is planned. The fork registers m8s:// and uses a distinct bundle identifier and m8s-app
data directory. Existing mesh:// links remain parseable when explicitly supplied;
the fork does not register itself as their system handler.

## Local node identity (user clarification)

Fleet overview is the landing screen. Both passive clients and inference hosts
can own/manage rental capacity. Node role is independent from control authority.
Before enabling paid operations the backend must attest its attachment to an
explicit local instance and verify owner identity and m8s authorization. An open
loopback port, UI connection or serving model is not authentication. Bind the
controller to the selected owner/node/mesh and refuse a silent switch. Surface
identity, role, disconnected/stale state and required owner attachment in UI.

## Dependency transport and validation

The npm endpoint presented a Block, Inc. Cloudflare Gateway CA certificate absent
from the local trust store. Installation succeeded through the public Yarn mirror
in a temporary directory, retaining lockfile integrity checks and TLS verification.
The repository registry and lockfile are unchanged. Production build, lint,
formatting, the 31-test mocked suite and four focused compute tests passed.
The passive-client layout was visually inspected. The native title and bundle are now named m8s, with separate local settings
and default Goose storage. Internal Rust crate names remain unchanged.

## Dedicated rental owner integration

The initial adapter reuses the bounded, certified-owner implementation from the
earlier desktop demo (4604533). An explicit private M8S_DESKTOP_CONFIG selects
one m8sd attempt. The fleet displays that attempt's verified owner identity,
not the unrelated embedded node. Failed polling clears identity and authority.
Navigation stays with the selected session. A configured session with no live
owner is shown as disconnected; configuration alone is not authentication.

This path provisions a dedicated passive owner client and a remote inference
host. It does not yet attach arbitrary existing passive clients or hosts. The
general design still permits either role to manage compute; integration must
bind authority to a selected node/mesh before extending this path. Keep that
gap visible rather than weakening the demo's certificate and role checks.

Readiness requires the owner certificate, exact model and coordinator canary.
Removal requires the exact-resource absence event and matching provider receipt.
The existing independent watchdog remains responsible after a UI failure.
Provider secrets never enter the WebView. This adapter is deliberately a single
attempt; a provider offer browser and multi-rental fleet are still outstanding.

Validation for the managed-session slice: 24 native Rust tests passed after
bundle/settings isolation; strict all-target Clippy passed. UI production build,
ESLint and formatting passed. The full mocked suite passed 35 tests; the six
fleet/rental tests were rerun after serializing status polling. Screenshots under
`docs/evidence/compute/rental-*-synthetic.png` use mocked backend data. No new
live rental or native-window recording has been claimed for this fork.

Native smoke check: launched the actual debug desktop with rental configuration
unset and isolated Goose storage. Inspected the m8s window through cmux: Fleet
renders, absent node identity is shown as unavailable, metrics are unknown and
owner attachment is required. This checks the native WebView/backend path, not
live rental provisioning or inference.

## Home and mesh-scoped navigation (user correction, 2026-10-29)

Home is again the default landing screen. Chat and Compute are top-level tabs
shown only for an attached running mesh; Home retains the current connection.
Recent successful connections are persisted in a mode-0600 backend history file
under the app's data root so they survive changes in the WebView origin/port.
Private connections retain an invite for reconnecting to the same mesh rather
than silently creating a fresh network. Reconnect checks current availability; the SDK may start a local client after
its old bootstrap peers time out. That is not proof of remote model readiness. The history is convenience state, not a rental authorization grant.

Home also scans Mesh's local runtime inventory and probes live loopback management
endpoints. Joining a discovered mesh creates this app's client; it does not take
over or stop the other process and does not authenticate rental ownership.
Unresponsive instances are omitted. Passive private creation uses the client SDK
without model/runtime installation. Model sharing remains a separate choice.

## Native public-join suspension

The observed app process was stopped (`T` state), and a macOS sample located its
interactive TUI thread in `crossterm::enable_raw_mode` / `tcsetattr`. The desktop's
progress sink advertises InteractiveDashboard for download events, which also
allowed the embedded runtime to start terminal input handling. Background-terminal
job control then suspended the GUI and both HTTP servers.

The desktop and headless HTTP daemon now replace stdin with /dev/null before
creating threads. They retain progress events but are never terminal input
consumers. Launch HTTP errors are displayed, state polling backs up SSE, and
mesh-only navigation disappears when the backend disconnects. Launch admission
reserves its phase before spawning; shutdown and startup serialize lifecycle work.

Live local validation: a model-free private mesh reached Running, shut down to
Idle, then public passive join reached Running with responsive management status
and shut down to Idle. No GPU rental or model download was needed. The older
embedded SDK also logs duplicate relay identity and ungraceful endpoint-close
warnings; these did not prevent this check but remain upstream integration work.

Final validation for this correction: 25 Rust tests, strict all-target Clippy,
UI build/lint/formatting and all 38 mocked browser tests pass. Repeated native
private/public start-stop checks with stdin explicitly inherited from /dev/tty
also pass, confirming initialization removes the terminal input dependency.
Recent meshes survived native restart (three saved test connections observed).

A real saved-private-mesh reconnect also reached a local passive Running state
after its old, stopped bootstrap peer exhausted retries (about two minutes).
No inference hosts were present. The SDK currently logs that peer-join failure
and still starts the local node; a shorter/cancellable peer-rejoin policy remains
an upstream integration issue. The progress screen now describes network
connection rather than model loading for all passive joins.
Eight focused browser checks passed again after correcting passive reconnect
progress and the connected-but-empty fleet message.
