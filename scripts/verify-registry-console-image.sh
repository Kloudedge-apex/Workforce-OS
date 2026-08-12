#!/usr/bin/env bash

# Pull one immutable ACR console image and run the local image contract against
# that exact registry object. Mutable tags are deliberately rejected.

set -euo pipefail

IMAGE="${1:-}"
EXPECTED_REVISION="${2:-}"
EXPECTED_CLERK_KEY_SHA256="${3:-}"
EXPECTED_PLATFORM="linux/amd64"

if [[ -z "${IMAGE}" || -z "${EXPECTED_REVISION}" ||
  ! "${EXPECTED_CLERK_KEY_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Usage: $0 <registry.azurecr.io/repository@sha256:digest> <full-lowercase-git-sha> <clerk-key-sha256>" >&2
  exit 2
fi
if [[ ! "${IMAGE}" =~ ^([a-z0-9]{5,50})\.azurecr\.io/[a-z0-9]+([._/-][a-z0-9]+)*@sha256:[0-9a-f]{64}$ ]]; then
  echo "ERROR: image must be a canonical lowercase ACR digest reference: ${IMAGE}" >&2
  exit 1
fi
REGISTRY_NAME="${BASH_REMATCH[1]}"
if [[ ! "${EXPECTED_REVISION}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: expected revision must be a full lowercase Git SHA" >&2
  exit 1
fi

for REQUIRED_COMMAND in az docker realpath; do
  if ! command -v "${REQUIRED_COMMAND}" >/dev/null 2>&1; then
    echo "ERROR: required command is unavailable: ${REQUIRED_COMMAND}" >&2
    exit 1
  fi
done
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is unavailable; refusing to verify an uninspected artifact" >&2
  exit 1
fi

az acr login --name "${REGISTRY_NAME}" --output none
docker pull --platform "${EXPECTED_PLATFORM}" "${IMAGE}" >/dev/null

REPO_DIGESTS="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "${IMAGE}")"
if ! grep -Fqx -- "${IMAGE}" <<<"${REPO_DIGESTS}"; then
  echo "ERROR: pulled image does not report the requested immutable digest: ${IMAGE}" >&2
  exit 1
fi

ACTUAL_PLATFORM="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "${IMAGE}")"
if [[ "${ACTUAL_PLATFORM}" != "${EXPECTED_PLATFORM}" ]]; then
  echo "ERROR: registry artifact platform is ${ACTUAL_PLATFORM:-<empty>}, expected ${EXPECTED_PLATFORM}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CONSOLE_IMAGE_HELPER="${SCRIPT_DIR}/verify-console-image.sh"
if [[ "$(realpath "${CONSOLE_IMAGE_HELPER}" 2>/dev/null || true)" != "${CONSOLE_IMAGE_HELPER}" ||
  ! -f "${CONSOLE_IMAGE_HELPER}" || -L "${CONSOLE_IMAGE_HELPER}" ||
  ! -x "${CONSOLE_IMAGE_HELPER}" ]]; then
  echo "ERROR: console image verifier is missing or unsafe" >&2
  exit 1
fi
"${CONSOLE_IMAGE_HELPER}" \
  "${IMAGE}" \
  "${EXPECTED_REVISION}" \
  "${EXPECTED_CLERK_KEY_SHA256}" || exit 1

echo "Registry console image verified: ${IMAGE} (${EXPECTED_PLATFORM}, revision=${EXPECTED_REVISION})"
