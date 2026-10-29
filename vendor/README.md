# Canonical identity signer

`mesh-llm-identity` starts from Mesh-LLM/mesh-llm commit
b4b33ef8cdf97017db5fb64ff6cebc3c9c6fa3b7, matching this desktop's SDK pin.
The patch adds `exact_node_signing.rs` from Mesh-LLM/m8s-plugin's MP-001
identity snapshot, changes its import to the older `ownership` module, and
exposes two existing canonical encoding helpers within the crate. Its manifest
is standalone and keeps the SDK's dependency versions; no SDK upgrade occurs.

The app bridge owns key custody, grant authorization, replay prevention and
active-mesh checks. The identity crate supplies exact signing mechanics only.
Do not duplicate its canonical certificate encoding in desktop code.
