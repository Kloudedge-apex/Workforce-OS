#!/usr/bin/env bash

# Canonical production console rollout. It builds only the exact published Git
# tree, resolves the completed ACR run to a digest, verifies the pulled object,
# and rolls the console Container App with automatic digest-based rollback.

set -euo pipefail

REGISTRY="ledgracr"
RESOURCE_GROUP="Ledgr-prod"
ACR_REPO="workforceos-fe"
APP="nikxius-web"
DOCKERFILE="Dockerfile"

ASSUME_YES="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      ASSUME_YES="true"
      shift
      ;;
    *)
      echo "Usage: $0 [--yes]" >&2
      exit 2
      ;;
  esac
done

if [[ -z "${VITE_CLERK_PUBLISHABLE_KEY:-}" || \
  ! "${VITE_CLERK_PUBLISHABLE_KEY}" =~ ^pk_(test|live)_[A-Za-z0-9_-]+$ ]]; then
  echo "ERROR: VITE_CLERK_PUBLISHABLE_KEY must be supplied in the environment" >&2
  exit 1
fi

VERIFY_ATTEMPTS="${CONSOLE_RELEASE_VERIFY_ATTEMPTS:-30}"
VERIFY_DELAY_SECONDS="${CONSOLE_RELEASE_VERIFY_DELAY_SECONDS:-10}"
if [[ ! "${VERIFY_ATTEMPTS}" =~ ^[1-9][0-9]*$ || ! "${VERIFY_DELAY_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: console release verification timing is invalid" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

# Untracked audit material cannot enter the build because the context comes
# from git archive. Tracked or staged drift is rejected.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: tracked working tree or index differs from HEAD" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${BRANCH}" != "main" ]]; then
  echo "ERROR: console production ships only from main (current: ${BRANCH})" >&2
  exit 1
fi

COMMIT="$(git rev-parse HEAD)"
if [[ ! "${COMMIT}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: HEAD is not a full lowercase Git SHA" >&2
  exit 1
fi
REMOTE_COMMIT="$(git ls-remote --exit-code origin refs/heads/main | awk 'NR == 1 { print $1 }')"
if [[ "${REMOTE_COMMIT}" != "${COMMIT}" ]]; then
  echo "ERROR: local HEAD ${COMMIT} is not the published origin/main head" >&2
  exit 1
fi

CLERK_KEY_PIN_PATH="docs/ops/production-clerk-publishable-key.sha256"
if ! CLERK_KEY_PIN_SOURCE="$(GIT_NO_REPLACE_OBJECTS=1 git show \
  "${COMMIT}:${CLERK_KEY_PIN_PATH}")"; then
  echo "ERROR: reviewed production Clerk publishable-key pin is missing from ${COMMIT}" >&2
  exit 1
fi
PINNED_CLERK_KEY_SHA256="$(awk '!/^#/ && NF { print $1; exit }' \
  <<<"${CLERK_KEY_PIN_SOURCE}")"
if [[ ! "${PINNED_CLERK_KEY_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: production Clerk publishable key is not configured in reviewed source" >&2
  exit 1
fi

"${REPO_ROOT}/scripts/verify-github-console-release-ci.sh" "${COMMIT}"

for REQUIRED_COMMAND in az docker tar openssl gh; do
  if ! command -v "${REQUIRED_COMMAND}" >/dev/null 2>&1; then
    echo "ERROR: required command is unavailable: ${REQUIRED_COMMAND}" >&2
    exit 1
  fi
done
ACTUAL_CLERK_KEY_SHA256="$(printf '%s' "${VITE_CLERK_PUBLISHABLE_KEY}" | openssl dgst -sha256 -r | awk '{ print $1 }')"
if [[ "${ACTUAL_CLERK_KEY_SHA256}" != "${PINNED_CLERK_KEY_SHA256}" ]]; then
  echo "ERROR: supplied Clerk publishable key does not match reviewed source" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is unavailable; the exact registry artifact cannot be verified" >&2
  exit 1
fi

RELEASE_LOCK_REPOSITORY="Kloudedge-apex/Workforce-OS"
RELEASE_LOCK_REF="refs/heads/workforce-os-release-lock/production-console"
RELEASE_LOCK_ENDPOINT="repos/${RELEASE_LOCK_REPOSITORY}/git/refs/heads/workforce-os-release-lock/production-console"
RELEASE_LOCK_ACQUIRED="false"
RELEASE_LOCK_SAFE_TO_RELEASE="true"
BUILD_CONTEXT=""
cleanup_release_resources() {
  local status=$?
  local lock_commit=""
  trap - EXIT
  set +e
  if [[ -n "${BUILD_CONTEXT:-}" && -d "${BUILD_CONTEXT}" ]]; then
    rm -rf -- "${BUILD_CONTEXT}"
  fi
  if [[ "${RELEASE_LOCK_ACQUIRED:-false}" == "true" &&
    "${RELEASE_LOCK_SAFE_TO_RELEASE:-false}" == "true" ]]; then
    lock_commit="$(gh api "${RELEASE_LOCK_ENDPOINT}" --jq '.object.sha' 2>/dev/null)"
    if [[ "${lock_commit}" == "${COMMIT}" ]]; then
      gh api --method DELETE "${RELEASE_LOCK_ENDPOINT}" >/dev/null 2>&1 ||
        echo "WARNING: console release lease cleanup failed; remove it only after confirming no rollout is active" >&2
    else
      echo "WARNING: console release lease identity changed; refusing to delete another process's lease" >&2
    fi
  elif [[ "${RELEASE_LOCK_ACQUIRED:-false}" == "true" ]]; then
    echo "ERROR: retaining the console release lease because rollout state is uncertain" >&2
    echo "       investigate Azure state before separately authorizing lease removal" >&2
  fi
  exit "${status}"
}
trap cleanup_release_resources EXIT
if ! gh api \
  --method POST \
  "repos/${RELEASE_LOCK_REPOSITORY}/git/refs" \
  -f "ref=${RELEASE_LOCK_REF}" \
  -f "sha=${COMMIT}" >/dev/null; then
  echo "ERROR: console production release lease is already held or could not be acquired" >&2
  echo "       inspect ${RELEASE_LOCK_REF} before any stale-lock removal" >&2
  exit 1
fi
RELEASE_LOCK_ACQUIRED="true"

PREVIOUS_IMAGE="$(az containerapp show \
  --name "${APP}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query 'properties.template.containers[0].image' \
  --output tsv)"
if [[ ! "${PREVIOUS_IMAGE}" =~ ^${REGISTRY}\.azurecr\.io/${ACR_REPO}@sha256:[0-9a-f]{64}$ ]]; then
  echo "ERROR: current ${APP} image is not an immutable ${ACR_REPO} digest" >&2
  echo "       complete the documented one-time legacy-tag normalization first" >&2
  exit 1
fi
"${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
  "${PREVIOUS_IMAGE}" "${COMMIT}"

TAG="${COMMIT}"
TAGGED_IMAGE="${REGISTRY}.azurecr.io/${ACR_REPO}:${TAG}"

echo "Branch    : ${BRANCH}"
echo "Commit    : ${COMMIT}"
echo "Build tag : ${TAGGED_IMAGE}"
echo "App       : ${APP} (rg ${RESOURCE_GROUP})"
echo "Prior image: ${PREVIOUS_IMAGE}"

if [[ "${ASSUME_YES}" != "true" ]]; then
  read -r -p "Deploy ${TAG} to PRODUCTION? Type 'deploy' to continue: " REPLY
  if [[ "${REPLY}" != "deploy" ]]; then
    echo "Aborted." >&2
    exit 1
  fi
fi

BUILD_CONTEXT="$(mktemp -d "${TMPDIR:-/tmp}/workforce-os-console-release.XXXXXX")"
GIT_NO_REPLACE_OBJECTS=1 git archive --format=tar "${COMMIT}" | \
  tar -xf - -C "${BUILD_CONTEXT}"

RUN_ID="$(az acr build \
  --registry "${REGISTRY}" \
  --image "${ACR_REPO}:{{.Run.ID}}" \
  --image "${ACR_REPO}:${TAG}" \
  --build-arg "VCS_REF=${COMMIT}" \
  --secret-build-arg "VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}" \
  --build-arg "VITE_CLERK_PUBLISHABLE_KEY_SHA256=${PINNED_CLERK_KEY_SHA256}" \
  --file "${DOCKERFILE}" \
  --platform linux/amd64 \
  --no-logs \
  --query runId \
  --output tsv \
  "${BUILD_CONTEXT}")"
if [[ ! "${RUN_ID}" =~ ^[a-z0-9]+$ ]]; then
  echo "ERROR: ACR returned an invalid build run ID: ${RUN_ID:-<empty>}" >&2
  exit 1
fi

RUN_STATUS="$(az acr task show-run \
  --registry "${REGISTRY}" \
  --run-id "${RUN_ID}" \
  --query status \
  --output tsv)"
if [[ "${RUN_STATUS}" != "Succeeded" ]]; then
  echo "ERROR: ACR build ${RUN_ID} status is ${RUN_STATUS:-<empty>}" >&2
  exit 1
fi

DIGEST="$(az acr task show-run \
  --registry "${REGISTRY}" \
  --run-id "${RUN_ID}" \
  --query "outputImages[?repository=='${ACR_REPO}' && tag=='${RUN_ID}'].digest | [0]" \
  --output tsv)"
if [[ ! "${DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "ERROR: ACR run ${RUN_ID} returned an invalid manifest digest" >&2
  exit 1
fi
COMMIT_TAG_DIGEST="$(az acr task show-run \
  --registry "${REGISTRY}" \
  --run-id "${RUN_ID}" \
  --query "outputImages[?repository=='${ACR_REPO}' && tag=='${TAG}'].digest | [0]" \
  --output tsv)"
if [[ "${COMMIT_TAG_DIGEST}" != "${DIGEST}" ]]; then
  echo "ERROR: ACR run ${RUN_ID} did not bind run and commit tags to one digest" >&2
  exit 1
fi

IMAGE="${REGISTRY}.azurecr.io/${ACR_REPO}@${DIGEST}"
echo "ACR run   : ${RUN_ID}"
echo "New image : ${IMAGE}"
"${REPO_ROOT}/scripts/verify-registry-console-image.sh" \
  "${IMAGE}" \
  "${COMMIT}" \
  "${PINNED_CLERK_KEY_SHA256}"

# Refuse to overwrite a release that appeared while the ACR build and registry
# verification were running. Recheck both identity and release posture as late
# as possible before the only production mutation.
CURRENT_REMOTE_COMMIT="$(git ls-remote --exit-code origin refs/heads/main | awk 'NR == 1 { print $1 }')"
if [[ "${CURRENT_REMOTE_COMMIT}" != "${COMMIT}" ]]; then
  echo "ERROR: origin/main advanced while the artifact was building; refusing to deploy stale source" >&2
  exit 1
fi
CURRENT_IMAGE="$(az containerapp show \
  --name "${APP}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query 'properties.template.containers[0].image' \
  --output tsv)"
if [[ "${CURRENT_IMAGE}" != "${PREVIOUS_IMAGE}" ]]; then
  echo "ERROR: console image changed while the artifact was building; refusing to overwrite a concurrent release" >&2
  echo "Captured image: ${PREVIOUS_IMAGE}" >&2
  echo "Current image : ${CURRENT_IMAGE:-<missing>}" >&2
  exit 1
fi
"${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
  "${PREVIOUS_IMAGE}" "${COMMIT}"

wait_for_release() {
  local expected_image=$1
  local attempt
  for ((attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++)); do
    if "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
      "${expected_image}" "${COMMIT}" >/dev/null 2>&1; then
      "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
        "${expected_image}" "${COMMIT}"
      return 0
    fi
    if ((attempt < VERIFY_ATTEMPTS)); then
      sleep "${VERIFY_DELAY_SECONDS}"
    fi
  done
  "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
    "${expected_image}" "${COMMIT}"
}

UPDATE_ATTEMPTED="false"
rollback_console() {
  local status=${1:-1}
  local rollback_failed="false"
  local current_image=""
  trap - ERR HUP INT TERM
  set +e
  echo "ERROR: console rollout did not complete; restoring ${PREVIOUS_IMAGE}" >&2
  if [[ "${UPDATE_ATTEMPTED}" == "true" ]]; then
    current_image="$(az containerapp show \
      --name "${APP}" \
      --resource-group "${RESOURCE_GROUP}" \
      --query 'properties.template.containers[0].image' \
      --output tsv)" || rollback_failed="true"
    if [[ "${current_image}" == "${IMAGE}" ]]; then
      if az containerapp update \
        --name "${APP}" \
        --resource-group "${RESOURCE_GROUP}" \
        --image "${PREVIOUS_IMAGE}" \
        --output none; then
        wait_for_release "${PREVIOUS_IMAGE}" || rollback_failed="true"
      else
        rollback_failed="true"
      fi
    elif [[ "${current_image}" == "${PREVIOUS_IMAGE}" ]]; then
      wait_for_release "${PREVIOUS_IMAGE}" || rollback_failed="true"
    else
      echo "ERROR: ${APP} changed outside this rollout; refusing to overwrite it during rollback" >&2
      rollback_failed="true"
    fi
  fi
  if [[ "${rollback_failed}" == "true" ]]; then
    echo "ERROR: automatic console rollback verification failed; operator intervention is required" >&2
    echo "Previous image: ${PREVIOUS_IMAGE}" >&2
    echo "Rejected image: ${IMAGE}" >&2
  else
    echo "Console rollback verified; retaining the lease for post-failure investigation." >&2
  fi
  exit "${status}"
}

rollback_on_error() {
  local status=$?
  rollback_console "${status}"
}
rollback_on_signal() {
  rollback_console "$1"
}
trap rollback_on_error ERR
trap 'rollback_on_signal 129' HUP
trap 'rollback_on_signal 130' INT
trap 'rollback_on_signal 143' TERM

RELEASE_LOCK_SAFE_TO_RELEASE="false"
UPDATE_ATTEMPTED="true"
if ! az containerapp update \
  --name "${APP}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${IMAGE}" \
  --output none; then
  rollback_console 1
fi
if ! wait_for_release "${IMAGE}"; then
  rollback_console 1
fi

trap - ERR HUP INT TERM
RELEASE_LOCK_SAFE_TO_RELEASE="true"

cat <<EOF

Deployed and read back ${IMAGE} on ${APP}.

Retain the ACR run ID, digest, GitHub CI run, and operator log with the release
evidence. Then perform the authorized fresh-tenant and cross-org browser smoke;
this source guard does not claim those live product gates passed.
EOF
