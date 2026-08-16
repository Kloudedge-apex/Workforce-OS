#!/usr/bin/env bash

# Validate the production console/BFF image without provider credentials or
# external network access. The same contract runs in CI and again after pulling
# the exact ACR digest selected for production.

set -euo pipefail

IMAGE="${1:-}"
EXPECTED_REVISION="${2:-}"
EXPECTED_CLERK_KEY_SHA256="${3:-}"

if [[ -z "${IMAGE}" || ! "${EXPECTED_REVISION}" =~ ^[0-9a-f]{40}$ ||
  ! "${EXPECTED_CLERK_KEY_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Usage: $0 <image> <full-lowercase-git-sha> <clerk-key-sha256>" >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is unavailable" >&2
  exit 1
fi

IMAGE_ID="$(docker image inspect --format '{{.Id}}' "${IMAGE}")"
if [[ ! "${IMAGE_ID}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "ERROR: image identity is invalid: ${IMAGE_ID:-<empty>}" >&2
  exit 1
fi

# Use the immutable local image ID after the initial resolution. This prevents
# a mutable tag from selecting different bytes between inspection and boot.
CONFIGURED_USER="$(docker image inspect --format '{{.Config.User}}' "${IMAGE_ID}")"
if [[ "${CONFIGURED_USER}" != "node" && ! "${CONFIGURED_USER}" =~ ^[1-9][0-9]*(:[0-9]+)?$ ]]; then
  echo "ERROR: image config user is not explicitly non-root: ${CONFIGURED_USER:-<empty>}" >&2
  exit 1
fi

EFFECTIVE_UID="$(docker run --rm --entrypoint node "${IMAGE_ID}" -p 'process.getuid()')"
EFFECTIVE_GID="$(docker run --rm --entrypoint node "${IMAGE_ID}" -p 'process.getgid()')"
if [[ "${EFFECTIVE_UID}" == "0" || "${EFFECTIVE_GID}" == "0" ]]; then
  echo "ERROR: image executes with root uid/gid (${EFFECTIVE_UID}:${EFFECTIVE_GID})" >&2
  exit 1
fi

REVISION="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "${IMAGE_ID}")"
if [[ "${REVISION}" != "${EXPECTED_REVISION}" ]]; then
  echo "ERROR: revision label ${REVISION:-<empty>} does not match ${EXPECTED_REVISION}" >&2
  exit 1
fi

SOURCE="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "${IMAGE_ID}")"
if [[ "${SOURCE}" != "https://github.com/Kloudedge-apex/Workforce-OS" ]]; then
  echo "ERROR: unexpected OCI source label: ${SOURCE:-<empty>}" >&2
  exit 1
fi

CLERK_KEY_SHA256="$(docker image inspect --format '{{index .Config.Labels "io.workforceos.clerk-publishable-key.sha256"}}' "${IMAGE_ID}")"
if [[ "${CLERK_KEY_SHA256}" != "${EXPECTED_CLERK_KEY_SHA256}" ]]; then
  echo "ERROR: image Clerk publishable-key digest does not match reviewed source" >&2
  exit 1
fi

CMD_JSON="$(docker image inspect --format '{{json .Config.Cmd}}' "${IMAGE_ID}")"
if [[ "${CMD_JSON}" != '["node","--enable-source-maps","artifacts/api-server/dist/index.mjs"]' ]]; then
  echo "ERROR: unexpected image command: ${CMD_JSON}" >&2
  exit 1
fi

HEALTHCHECK_JSON="$(docker image inspect --format '{{json .Config.Healthcheck.Test}}' "${IMAGE_ID}")"
if [[ "${HEALTHCHECK_JSON}" != *"/api/healthz"* ]]; then
  echo "ERROR: image healthcheck does not target /api/healthz" >&2
  exit 1
fi

NODE_ENV_VALUE="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${IMAGE_ID}" | awk -F= '$1 == "NODE_ENV" { print substr($0, index($0, "=") + 1) }')"
PORT_VALUE="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${IMAGE_ID}" | awk -F= '$1 == "PORT" { print substr($0, index($0, "=") + 1) }')"
FE_DIST_VALUE="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${IMAGE_ID}" | awk -F= '$1 == "FE_DIST" { print substr($0, index($0, "=") + 1) }')"
if [[ "${NODE_ENV_VALUE}" != "production" || "${PORT_VALUE}" != "8080" || "${FE_DIST_VALUE}" != "/app/artifacts/workforce-os/dist/public" ]]; then
  echo "ERROR: image runtime environment contract is invalid" >&2
  exit 1
fi

docker run --rm \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --network none \
  --interactive \
  --entrypoint node \
  "${IMAGE_ID}" <<'NODE'
const fs = require("node:fs");

if (process.getuid() === 0 || process.getgid() === 0) {
  throw new Error("runtime process has root uid/gid");
}

const requiredFiles = [
  "/app/artifacts/api-server/dist/index.mjs",
  "/app/artifacts/workforce-os/dist/public/index.html",
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`missing runtime file: ${file}`);
}

if (fs.existsSync("/app/.git")) {
  throw new Error("Git metadata leaked into the runtime image");
}

const index = fs.readFileSync(
  "/app/artifacts/workforce-os/dist/public/index.html",
  "utf8",
);
if (!index.includes('<div id="root"></div>')) {
  throw new Error("built console index is missing the application root");
}

for (const name of ["express", "jose", "pino"]) require.resolve(name);

try {
  fs.writeFileSync("/app/.write-probe", "must fail");
  throw new Error("read-only application filesystem accepted a write");
} catch (error) {
  if (!error || !["EACCES", "EROFS"].includes(error.code)) throw error;
}
fs.writeFileSync("/tmp/write-probe", "ok");
fs.unlinkSync("/tmp/write-probe");
NODE

# Start the image through its real default command on a network-isolated
# namespace. Exercise the static SPA and unauthenticated API boundary from
# inside the container so this proves the shipped BFF boots without granting it
# outbound access or exposing a host port.
RUNTIME_CONTAINER=""
cleanup_runtime_container() {
  if [[ -n "${RUNTIME_CONTAINER}" ]]; then
    docker rm --force "${RUNTIME_CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap cleanup_runtime_container EXIT HUP INT TERM

RUNTIME_CONTAINER="$(docker run --detach \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --network none \
  --env API_UPSTREAM_URL=https://apex-gtm-api.braveflower-6d3bb66b.eastus.azurecontainerapps.io \
  --env CLERK_JWKS_URL=https://clerk.workforceos.invalid/.well-known/jwks.json \
  --env CLERK_ISSUER=https://clerk.workforceos.invalid \
  --env CLERK_AUTHORIZED_PARTIES=https://workforceos.invalid \
  "${IMAGE_ID}")"

RUNTIME_READY=false
for _ in $(seq 1 30); do
  if docker exec "${RUNTIME_CONTAINER}" node -e \
    "fetch('http://127.0.0.1:8080/api/healthz').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"; then
    RUNTIME_READY=true
    break
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "${RUNTIME_CONTAINER}" 2>/dev/null || true)" != "true" ]]; then
    break
  fi
  sleep 1
done

if [[ "${RUNTIME_READY}" != "true" ]]; then
  echo "ERROR: console image default command did not become healthy" >&2
  docker logs --tail 80 "${RUNTIME_CONTAINER}" >&2 || true
  exit 1
fi

docker exec --interactive "${RUNTIME_CONTAINER}" node <<'NODE'
(async () => {
  const origin = "http://127.0.0.1:8080";

  const health = await fetch(`${origin}/api/healthz`);
  if (health.status !== 200) {
    throw new Error(`health probe returned ${health.status}`);
  }
  const healthBody = await health.json();
  if (healthBody?.status !== "ok") {
    throw new Error("health probe did not return the expected status");
  }

  const home = await fetch(`${origin}/`);
  const html = await home.text();
  if (home.status !== 200 || !html.includes('<div id="root"></div>')) {
    throw new Error("default command did not serve the built SPA");
  }

  const protectedRoute = await fetch(`${origin}/api/today`);
  const protectedBody = await protectedRoute.json();
  if (
    protectedRoute.status !== 401 ||
    protectedBody?.error !== "missing bearer token"
  ) {
    throw new Error(
      `anonymous tenant route did not fail closed (${protectedRoute.status})`,
    );
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

docker stop --time 10 "${RUNTIME_CONTAINER}" >/dev/null
RUNTIME_STATE="$(docker inspect --format '{{.State.Status}}:{{.State.ExitCode}}:{{.State.OOMKilled}}' "${RUNTIME_CONTAINER}")"
if [[ ! "${RUNTIME_STATE}" =~ ^exited:(0|143):false$ ]]; then
  echo "ERROR: console image did not stop cleanly after SIGTERM: ${RUNTIME_STATE}" >&2
  docker logs --tail 80 "${RUNTIME_CONTAINER}" >&2 || true
  exit 1
fi

cleanup_runtime_container
RUNTIME_CONTAINER=""
trap - EXIT HUP INT TERM

echo "Console image contract verified: ${IMAGE} (${IMAGE_ID}, uid=${EFFECTIVE_UID}, gid=${EFFECTIVE_GID}, revision=${REVISION})"
