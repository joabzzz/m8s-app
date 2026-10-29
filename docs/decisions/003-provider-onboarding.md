# ADR 003 — Provider onboarding for managed rentals

Status: implemented; 2026-10-29. Keeps ADR 002's bounded managed-rental lifecycle.

Compute contains provider cards and the credential flow. Settings exposes the same
flow while detached from a mesh. Vast is supported; Nebius is explicitly coming
soon and accepts no credentials. The Vast logo is an unmodified official asset
from its press kit, displayed on a dark background.

The app validates a pasted key against Vast's fixed HTTPS account endpoint before
saving it. Redirects and proxy inheritance are disabled, requests have a deadline,
and responses are size-bounded. Errors are closed messages, never provider bodies.
Keys use private 0600 files under a checked 0700 app directory; provider settings
are atomically replaced and synced. Status returns only account/connection metadata.
The password field clears after submission. Keys are never put in browser storage,
URLs, process arguments, logs or returned API data. Private-file storage is explicit
in the UI; OS-keychain integration remains future work because the current CLI and
independent recovery worker require a selected credential file.

Provider changes share the rental action lock and invalidate outstanding quotes.
A retained launch intent blocks replacement/disconnect until exact instance,
account and image absence evidence matches. Disconnect removes the app-managed
key, preserves accounting/attempt records and never deletes an external dotenv
file. A tombstone prevents silently falling back to an environment key afterward.

An existing explicitly configured rental plan keeps its accounting baseline and
account binding. The selected profile and controller paths are persisted with
provider metadata, including across disconnect, so a normal relaunch without
environment variables cannot fall back to a zero-baseline profile. A pasted key for another account is rejected against that profile.
Without an explicit plan, a verified account gets a stable, app-private managed
control directory, a persistent random installation-specific owner label, and one bounded attempt: USD6 maximum, 25 minutes runtime,
four minutes cleanup and USD1 contingency. Quotes still independently qualify
account, empty inventories, hardware, price and complete reserves before confirmation.
The initial baseline remains unknown until that fresh inventory check succeeds.
A consumed attempt is never rotated/reset by replacing keys or reconnecting.
This is not a cross-device lifetime budget or a repeat-rental scheduler. Never
remove an explicit historical plan to evade retained liabilities.

Managed instance controls are inspection, copy instance ID, provider console,
connection details and confirmed removal. The user chose to keep this lifecycle.
Pause/resume and interactive SSH are not supported: stopping the container breaks
its authenticated control session, and the current image's SSH key permits only
provisioning commands. Do not reuse that key as a terminal login or add a plaintext
management route. A future persistent mode needs separate operator credentials,
renewable admission and accounting across stopped states. Stopped instances can
still incur storage charges.

External browser actions accept a closed destination enum and execute the system
URL opener with a fixed HTTPS URL and no shell. No arbitrary URL, SSH command,
provider-derived host string or executable can reach this boundary.

Validation covers credential input, secret-free status, fixed browser destinations,
private persistence/disconnect behavior, refusal while cleanup is unconfirmed,
wrong-resource cleanup evidence, retained intent, no environment fallback, setup
from detached Settings, rejected keys, and browser-storage exclusion.

Native verification on 2026-10-29 accepted the selected account key, checked private
file/directory modes, revalidated through the native Verify connection button, and
loaded live offers through the saved key. A normal relaunch without provider,
controller or rental-plan environment variables retained the saved connection and
historical profile and loaded 70 offers. No rental or provider mutation was
performed. This validates onboarding and discovery, not the unresolved current-mesh
inference canary documented in ADR 002.
