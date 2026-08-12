# Workforce OS console release guard

The production console and same-origin BFF ship as one image:

- GitHub repository: `Kloudedge-apex/Workforce-OS`
- source branch: `main`
- registry repository: `ledgracr.azurecr.io/workforceos-fe`
- Azure Container App: `nikxius-web` in `Ledgr-prod`
- runtime platform: `linux/amd64`

`scripts/deploy-console-prod.sh` is the admitted image rollout path. The
mutable checkout only selects `HEAD`; uncommitted working-tree and index bytes
are never inspected or released. A parent-owned private Git object view creates
the snapshot without source-repository config, hooks, info attributes, or
inherited Git routing. The parent removes that exact temporary path after the
child exits. The controller, every release helper, both pins, and the ACR build
context all run from that exact-commit snapshot, never from the worktree.

The snapshot-root shape and realpath checks, parent-PID match, and random
token plus mode-0600 token-file match are structural anti-footgun checks. They
operate under the protected workflow's trusted-invoker and trusted-runner
assumption; they are not an independent cryptographic provenance or hostile
same-user isolation boundary. Release provenance still depends on that
protected workflow, the published exact commit, and its required CI evidence.

The script creates a unique lease commit for each attempt and atomically
acquires `refs/heads/workforce-os-release-lock/production-console` with an
explicit create-if-absent Git lease. An existing ref is rejected even when it
is an ancestor of the new lease commit. Successful cleanup is also conditional
on the ref still naming that attempt's unique commit; a changed lease cannot
be deleted by a stale process. Cleanup failure retains the lease and makes the
controller exit nonzero even after a healthy rollout. No other writer may
mutate the Container App while that lease exists. A stale lease must be
investigated against its lease commit, candidate parent, attempt ID, operator
session, and Azure state before separately authorized removal.
Once an image update is attempted, every failed rollout retains the lease,
including one whose compensating rollback verifies healthy, so another rollout
cannot enter potentially delayed or uncertain production state.

## Source and CI admission

Before a rollout:

1. Commit and publish every intended console release change to `origin/main`.
2. Leave unrelated working-tree, index, and untracked audit material alone.
   The deploy bootstrap creates one private snapshot from the selected commit
   with replacement objects disabled. Repository-local info attributes, local
   or inherited Git config, uncommitted bytes, and later worktree changes cannot
   affect the controller, its helpers, or the image. Committed
   `.gitattributes` rules remain part of the selected tree and still apply.
3. Wait for the push-triggered GitHub `CI` workflow on that exact commit. Both
   `Type Check, Test & Build` and `Production Console Image Contract` must pass.
4. **External NO-GO:** a protected deploy workflow/environment with CI OIDC and
   required branch protection does not yet exist; branch-protection enablement
   remains plan-blocked. Do not run this production controller until that
   external release boundary exists, using `git`, `gh`, `jq`, Azure CLI, and a
   working Linux/amd64 Docker engine.

## Container App mutation authority

The documented stable Azure Container Apps update contract through
`2026-01-01` exposes no ETag/`If-Match` request precondition. This controller
therefore does not claim provider-enforced compare-and-swap. Its unique GitHub
lease, exact final pre-write image read, and post-write verification serialize
only cooperating writers and detect divergence; they do not stop an unrelated
Azure principal in the final read/write window.

Production RBAC must close that gap before a release. Audit inherited and
direct role assignments and prove there is no other writer: the protected CI
OIDC principal alone may hold `Microsoft.App/containerApps/write` on
`nikxius-web`. Remove standing user, group, Contributor, Owner, automation,
and break-glass write paths or treat the release as blocked. Record the RBAC
evidence with the release approval. This is an external NO-GO until the
protected workflow and exclusive RBAC exist. Only that future protected job
may supply `ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=true`; an operator must
not export or attest it from a workstation.

The controller checks this attestation before creating a lease or registry
artifact and again immediately before every forward or rollback Container App
write. Unset or false fails closed. If exclusive authority cannot be proved,
do not release with this controller.

The Dockerfile pins its frontend and Node 24 base manifests. The image contract
requires a non-root runtime, the exact command and healthcheck, the built FE and
BFF artifacts, read-only compatibility, and an OCI revision label equal to the
full source commit.

## Required Container App posture

The read-only `scripts/verify-console-containerapp-config.sh` guard requires:

- one externally reachable container in single-revision mode with at least one
  minimum replica;
- immutable `workforceos-fe@sha256:...` image identity;
- port `8080` and `/api/healthz` liveness probe;
- `NODE_ENV=production`, `PORT=8080`, and the canonical `FE_DIST`;
- a TLS-only ingress and an HTTPS `API_UPSTREAM_URL` whose exact SHA-256 is
  pinned in `docs/ops/production-api-upstream-url.sha256` at the exact candidate
  commit;
- explicit Clerk JWKS, issuer/domain, and authorized-party configuration;
- `DEV_TRUST_X_ORG_ID` unset or `false`; and
- a healthy, active latest revision running the expected digest.

The currently documented legacy deployment used a mutable image tag. The
deploy script intentionally refuses to guess a rollback digest from that tag.
Before the first guarded rollout, an authorized operator must perform a
separately reviewed one-time normalization: establish the exact digest of the
currently running artifact from registry and deployment evidence, update the
Container App to that digest without changing its bytes or configuration, and
retain the read-back and health evidence. Stop if the running artifact cannot
be tied to a unique digest.

## Rollout

The Clerk publishable key is a public browser identifier, but the release path
still changes the browser bundle. Its exact SHA-256 must be committed in
`docs/ops/production-clerk-publishable-key.sha256` through a reviewed source
change; the initial `UNCONFIGURED` value deliberately blocks production. The
release path reads that pin from the exact candidate commit with local Git
replacement objects disabled rather than from the mutable working tree,
matches the supplied key to it, passes it as a masked ACR
build argument, and verifies the same digest in the resulting image label. The
Container App verifier likewise reads the API-upstream pin from that commit.

The future protected job must inject the reviewed
`VITE_CLERK_PUBLISHABLE_KEY` and the authority attestation without printing
either value, then invoke `scripts/deploy-console-prod.sh --yes`. There is
currently no authorized manual-workstation invocation. `--yes` is mandatory;
the script has no interactive approval path, and its private snapshot
controller runs with stdin attached to `/dev/null`. HUP, INT, and TERM are
forwarded to that controller's isolated process group before the bootstrap
waits for termination and removes the private snapshot.
The protected job must execute `scripts/deploy-console-prod.sh` directly, not
through `bash scripts/deploy-console-prod.sh`, so the privileged shebang is the
shell startup boundary.

Within that future protected job, the script:

1. runs the release controller and helpers as a child from the private `HEAD`
   snapshot and proves it equals published `origin/main`;
2. verifies exact-commit GitHub CI;
3. acquires a unique create-if-absent GitHub lease;
4. verifies the existing immutable rollback image and live configuration;
5. uploads the same private tracked-tree snapshot to ACR;
6. obtains the digest from the completed ACR run record, not a tag lookup;
7. pulls that digest as `linux/amd64` and reruns the image contract;
8. repeats the production image read immediately before the authorized write,
   updates `nikxius-web`, waits for the healthy active revision, and rolls back
   to the captured prior digest if rollout verification fails.

Retain the commit, GitHub run, ACR run ID, registry digest, prior digest,
operator identity, and command log. Do not place Clerk tokens, customer data,
or other credentials in the evidence record.

This guard proves artifact and rollout identity only. Fresh-user onboarding,
cross-organization denial, real OAuth, provider delivery, DNS, and browser
behavior remain controlled staging/live release gates.
