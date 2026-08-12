# Workforce OS console release guard

The production console and same-origin BFF ship as one image:

- GitHub repository: `Kloudedge-apex/Workforce-OS`
- source branch: `main`
- registry repository: `ledgracr.azurecr.io/workforceos-fe`
- Azure Container App: `nikxius-web` in `Ledgr-prod`
- runtime platform: `linux/amd64`

`scripts/deploy-console-prod.sh` is the admitted image rollout path. It does
not change DNS, secrets, environment variables, or application behavior. It
only builds the exact published commit, verifies the resulting registry
object, and updates the image reference with digest-based rollback.

The script atomically acquires
`refs/heads/workforce-os-release-lock/production-console` in GitHub before
reading production state. No direct Container App mutation is permitted while
that lease exists. A stale lease must be investigated against its commit,
operator session, and Azure state before separately authorized removal.
Once an image update is attempted, every failed rollout retains the lease,
including one whose compensating rollback verifies healthy, so another rollout
cannot enter potentially delayed or uncertain production state.

## Source and CI admission

Before a rollout:

1. Commit and publish every intended console release change to `origin/main`.
2. Leave unrelated untracked audit material alone. The deploy script rejects
   tracked or staged drift, then creates a fresh build context with
   `git archive <commit>` with replacement objects disabled; untracked,
   ignored, and local replacement-ref bytes cannot enter the image.
3. Wait for the push-triggered GitHub `CI` workflow on that exact commit. Both
   `Type Check, Test & Build` and `Production Console Image Contract` must pass.
4. Run from an authenticated operator workstation with `git`, `gh`, `jq`,
   Azure CLI, and a working Linux/amd64 Docker engine.

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

```bash
export VITE_CLERK_PUBLISHABLE_KEY='<environment-specific publishable key>'
scripts/deploy-console-prod.sh
```

For an already approved non-interactive execution, add `--yes`. The script:

1. proves local `HEAD` equals published `origin/main`;
2. verifies exact-commit GitHub CI;
3. verifies the existing immutable rollback image and live configuration;
4. uploads a fresh tracked-tree archive to ACR;
5. obtains the digest from the completed ACR run record, not a tag lookup;
6. pulls that digest as `linux/amd64` and reruns the image contract;
7. updates `nikxius-web`, waits for the healthy active revision, and rolls back
   to the captured prior digest if rollout verification fails.

Retain the commit, GitHub run, ACR run ID, registry digest, prior digest,
operator identity, and command log. Do not place Clerk tokens, customer data,
or other credentials in the evidence record.

This guard proves artifact and rollout identity only. Fresh-user onboarding,
cross-organization denial, real OAuth, provider delivery, DNS, and browser
behavior remain controlled staging/live release gates.
