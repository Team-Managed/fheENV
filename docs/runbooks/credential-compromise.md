# Credential compromise response

Use this runbook for a suspected Pinata token, credential-bearing RPC URL,
WalletConnect project/session credential, or external secret-provider
credential compromise. Treat plaintext already returned to an authorized
client as exposed; rotating a transport credential cannot recall it.

Record an incident identifier, UTC timestamps, operator, affected projects and
environments, approvals, transaction hashes, provider event IDs, and every
validation result. Never paste a credential value into the incident record.

## Pinata credential

1. **Detection** — Confirm the alert or anomalous upload through Pinata audit
   metadata. Identify the credential reference with `fheenv credentials status`;
   do not retrieve or print its value.
2. **Containment** — Disable the token at Pinata. Pause pushes that depend on it.
   Preserve provider logs and relevant local audit exports.
3. **Rotation** — Create a least-privilege replacement token and store it with
   `fheenv credentials set <reference>`. Use hidden input or explicit `--stdin`.
4. **Authorization update** — Restrict scopes, source networks, and expiry.
   Update only the selected credential source; `.fheenv.json` does not change.
5. **Validation** — Check status metadata, perform a test upload/download of
   ciphertext, and verify that no secret appears in output or project config.
6. **Revocation** — Permanently revoke the old token and remove unused
   duplicates. Unpin blobs only under the data-retention policy.
7. **Evidence capture** — Retain token IDs (not values), approvals, provider
   audit entries, CLI result, and revocation confirmation.

## RPC credential

1. **Detection** — Confirm quota, billing, or access anomalies with the RPC
   provider and identify affected `credentialRef` entries.
2. **Containment** — Disable the credential or restrict it to known origins,
   networks, methods, and rate limits. Move critical jobs to an approved
   secondary endpoint.
3. **Rotation** — Issue and store a replacement under the configured reference.
4. **Authorization update** — Apply chain and JSON-RPC method allowlists. Public
   HTTPS endpoints can remain inline only when they contain no credential.
5. **Validation** — Run a read-only chain-ID/block query, then one approved
   simulated operation. Confirm the resolved chain matches project config.
6. **Revocation** — Revoke the old credential and remove temporary endpoint
   overrides.
7. **Evidence capture** — Retain provider request IDs, policy changes, test
   results, and final revocation time.

## WalletConnect project or session

1. **Detection** — Identify unexpected pairings, account/chain changes, relay
   activity, or wallet prompts. A pairing URI must never be copied into tickets
   or logs.
2. **Containment** — Reject outstanding wallet prompts, disconnect the session
   in the wallet, and stop active CLI operations.
3. **Rotation** — Rotate the WalletConnect project ID if exposed. Delete the
   old credential reference, store the replacement, and reconfigure/pair.
4. **Authorization update** — Verify the expected wallet address and chain
   before saving. Remove unauthorized wallet sessions and stale relay pairings.
5. **Validation** — Complete a fresh pairing and a harmless address/signature
   proof. Confirm local signature recovery and expected-address matching.
6. **Revocation** — Revoke the old project credential and disconnect every old
   session from the wallet. Quarantined local state can be removed after
   evidence capture.
7. **Evidence capture** — Retain project/session identifiers that do not expose
   pairing material, wallet audit events, operator approval, and validation
   output.

## External secret provider

1. **Detection** — Correlate provider audit logs with fheENV errors or
   unexpected secret resolution. Identify the `exec://provider/key` reference
   without resolving it.
2. **Containment** — Disable the provider workload identity or executable,
   revoke its token, and stop affected jobs.
3. **Rotation** — Rotate the provider credential and, if integrity is
   uncertain, replace and re-attest the executable.
4. **Authorization update** — Restore only required secret paths, operations,
   environment variables, and source identities.
5. **Validation** — Verify executable ownership/path, protocol bounds, provider
   identity, and one permitted resolution without printing the value.
6. **Revocation** — Revoke all superseded tokens, identities, and binaries.
7. **Evidence capture** — Retain binary digest/signature, provider audit IDs,
   policy diff, approvals, validation, and revocation result.

After any compromise, search CI logs, shell history, crash reports, analytics,
and tickets for accidental disclosure. If an attacker may have decrypted an
environment, rotate the environment values themselves and run `fheenv rotate`;
credential replacement alone is insufficient.
