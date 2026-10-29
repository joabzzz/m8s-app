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
