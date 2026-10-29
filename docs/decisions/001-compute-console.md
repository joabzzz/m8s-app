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
or updater is planned. Existing mesh:// registration must be reconsidered before
installing this fork beside Mesh.app to avoid hijacking upstream invite links.

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
The passive-client layout was visually inspected. Native bundle rebranding and
data-directory isolation remain pending before installation.
