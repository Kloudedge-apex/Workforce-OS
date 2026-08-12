#!/usr/bin/env bash

# Validate the production console/BFF image without provider credentials or
# network access. The same contract runs in CI and again after pulling the
# exact ACR digest selected for production.

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

CONFIGURED_USER="$(docker image inspect --format '{{.Config.User}}' "${IMAGE}")"
if [[ "${CONFIGURED_USER}" != "node" && ! "${CONFIGURED_USER}" =~ ^[1-9][0-9]*(:[0-9]+)?$ ]]; then
  echo "ERROR: image config user is not explicitly non-root: ${CONFIGURED_USER:-<empty>}" >&2
  exit 1
fi

EFFECTIVE_UID="$(docker run --rm --entrypoint node "${IMAGE}" -p 'process.getuid()')"
EFFECTIVE_GID="$(docker run --rm --entrypoint node "${IMAGE}" -p 'process.getgid()')"
if [[ "${EFFECTIVE_UID}" == "0" || "${EFFECTIVE_GID}" == "0" ]]; then
  echo "ERROR: image executes with root uid/gid (${EFFECTIVE_UID}:${EFFECTIVE_GID})" >&2
  exit 1
fi

REVISION="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "${IMAGE}")"
if [[ "${REVISION}" != "${EXPECTED_REVISION}" ]]; then
  echo "ERROR: revision label ${REVISION:-<empty>} does not match ${EXPECTED_REVISION}" >&2
  exit 1
fi

SOURCE="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "${IMAGE}")"
if [[ "${SOURCE}" != "https://github.com/Kloudedge-apex/Workforce-OS" ]]; then
  echo "ERROR: unexpected OCI source label: ${SOURCE:-<empty>}" >&2
  exit 1
fi

CLERK_KEY_SHA256="$(docker image inspect --format '{{index .Config.Labels "io.workforceos.clerk-publishable-key.sha256"}}' "${IMAGE}")"
if [[ "${CLERK_KEY_SHA256}" != "${EXPECTED_CLERK_KEY_SHA256}" ]]; then
  echo "ERROR: image Clerk publishable-key digest does not match reviewed source" >&2
  exit 1
fi

CMD_JSON="$(docker image inspect --format '{{json .Config.Cmd}}' "${IMAGE}")"
if [[ "${CMD_JSON}" != '["node","--enable-source-maps","artifacts/api-server/dist/index.mjs"]' ]]; then
  echo "ERROR: unexpected image command: ${CMD_JSON}" >&2
  exit 1
fi

HEALTHCHECK_JSON="$(docker image inspect --format '{{json .Config.Healthcheck.Test}}' "${IMAGE}")"
if [[ "${HEALTHCHECK_JSON}" != *"/api/healthz"* ]]; then
  echo "ERROR: image healthcheck does not target /api/healthz" >&2
  exit 1
fi

NODE_ENV_VALUE="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${IMAGE}" | awk -F= '$1 == "NODE_ENV" { print substr($0, index($0, "=") + 1) }')"
PORT_VALUE="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${IMAGE}" | awk -F= '$1 == "PORT" { print substr($0, index($0, "=") + 1) }')"
FE_DIST_VALUE="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${IMAGE}" | awk -F= '$1 == "FE_DIST" { print substr($0, index($0, "=") + 1) }')"
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
  "${IMAGE}" <<'NODE'
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

echo "Console image contract verified: ${IMAGE} (uid=${EFFECTIVE_UID}, gid=${EFFECTIVE_GID}, revision=${REVISION})"
