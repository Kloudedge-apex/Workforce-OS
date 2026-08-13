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
child exits. The controller, every release helper, all three pins, and the ACR build
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
4. The manual-only source workflow is
   `.github/workflows/release-production.yml`. Adding that file on a review
   branch does not create or prove a production release boundary. **External
   NO-GO:** do not dispatch it until the source change is reviewed on `main`,
   `main` is reported protected by GitHub, and the fixed
   `workforce-os-production` environment has administrator bypass disabled, at
   least one required reviewer with self-review prevention, and a
   protected-branches-only deployment policy. The workflow audits those
   settings through the environment API and fails closed when its token cannot
   read them.
5. The protected environment, OIDC federation, and exclusive Azure RBAC do not
   yet exist as verified release evidence. The environment must own the
   `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, and
   `ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED` variables and the
   `VITE_CLERK_PUBLISHABLE_KEY` secret. Repository- or organization-scoped
   fallbacks are not admitted: the workflow checks each environment metadata
   endpoint before checkout and OIDC login. Both
   `production-api-upstream-url.sha256` and
   `production-clerk-publishable-key.sha256` also remain `UNCONFIGURED` at this
   commit. Do not guess either value from tests, examples, or historical notes.

At this review point GitHub reports `main` as unprotected, the repository has
no environments, and the private-repository protection API is plan-blocked.
The eventual branch evidence must prove more than the boolean `protected`
flag: require reviewed pull requests, the exact blocking CI checks, stale-review
dismissal, administrator enforcement, and disabled force-push/deletion. The
workflow's runtime flag check does not replace that separately retained ruleset
evidence.

`scripts/verify-production-release-workflow.sh` enforces the manual trigger,
minimal permissions, fixed environment and concurrency, pinned actions, exact
ordered job/step shape, environment metadata checks, and direct controller
invocation. CI runs it during review, and the release workflow reruns it from
the exact checked-out commit before trust-pin validation or OIDC. This is a
source-review defense, not runtime authority: only protected reviewed source
combined with an approved and successfully audited production environment can
authorize the release job.

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
- explicit Clerk JWKS, issuer/domain, audience, and authorized-party
  configuration whose exact versioned tuple is pinned in
  `docs/ops/production-clerk-auth.sha256` at the exact candidate commit;
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
Container App verifier likewise reads the API-upstream and Clerk-auth pins from
that commit.

The BFF's Clerk verifier trust root is independently pinned in
`docs/ops/production-clerk-auth.sha256`. The hash input is six fields in this
exact order, with a NUL byte after every field: the version marker
`workforce-os-clerk-auth.v1`, then five self-describing `NAME=value` fields.
Empty values retain their field name and equals sign. The reviewed v1 tuple is:

1. `CLERK_JWKS_URL=https://clerk.workforceos.xyz/.well-known/jwks.json`
2. `CLERK_ISSUER=https://clerk.workforceos.xyz`
3. `CLERK_DOMAIN=`
4. `CLERK_AUDIENCE=`
5. `CLERK_AUTHORIZED_PARTIES=https://workforceos.xyz`

That framing hashes to
`5eddc3f498e16df540776fa025bef86f741fae6815abfb9dd80652026b8956ad`.
Any change to one of those five runtime values requires a reviewed source-pin
change before the Container App can pass release verification.

The legacy Container Apps do not satisfy this tuple. The console and backend
release controllers verify existing configuration before building an artifact
or changing an image, so the first release intentionally stops until a
separately authorized provider configuration change normalizes `nikxius-web`,
`apex-gtm-api`, and `apex-gtm-worker` to the exact five values above. That
change must use the future protected OIDC release authority, not a local user
session. Capture the prior revisions and sanitized non-secret configuration
evidence, update the API and worker as one coordinated change, apply the same
tuple to the console, and run both repository verifiers against the active
immutable image digests. Restore the captured revisions if authentication
smoke checks fail. Do not weaken or bypass the preflight to admit legacy
configuration.

After every external NO-GO above is closed, dispatch the workflow from protected
`main` with the exact 40-character current `main` SHA and the exact phrase
`RELEASE WORKFORCE OS PRODUCTION`. It rechecks the remote `main` identity,
exact-commit CI, environment policy and variable/secret scope, reviewed pins,
and the logged-in Azure subscription, tenant, and service-principal client ID
before release. The authority attestation comes only from the protected
environment variable; it is neither a dispatch input nor a source constant.

The protected job injects the reviewed `VITE_CLERK_PUBLISHABLE_KEY` without
printing it, then invokes `scripts/deploy-console-prod.sh --yes` directly. There
is no authorized manual-workstation invocation. `--yes` is mandatory; the
script has no interactive approval path, and its private snapshot controller
runs with stdin attached to `/dev/null`. HUP, INT, and TERM are forwarded to
that controller's isolated process group before the bootstrap waits for
termination and removes the private snapshot. Direct execution is required so
the privileged shebang remains the shell startup boundary.

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
reviewer/operator identity, and command log. A successful workflow appends a
concise evidence index to its run summary; the controller's detailed identities
and verification output remain in that protected run log. Do not place Clerk
tokens, customer data, or other credentials in the evidence record.

This guard proves artifact and rollout identity only. Fresh-user onboarding,
cross-organization denial, real OAuth, provider delivery, DNS, and browser
behavior remain controlled staging/live release gates.
