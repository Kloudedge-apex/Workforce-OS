#!/usr/bin/env bash

# Read-only verification of the production console Container App. Environment
# values are evaluated in-memory and never printed.

set -euo pipefail

EXPECTED_IMAGE="${1:-}"
EXPECTED_COMMIT="${2:-}"
RESOURCE_GROUP="Ledgr-prod"
APP="nikxius-web"

if [[ ! "${EXPECTED_IMAGE}" =~ ^ledgracr\.azurecr\.io/workforceos-fe@sha256:[0-9a-f]{64}$ ||
  ! "${EXPECTED_COMMIT}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <ledgracr.azurecr.io/workforceos-fe@sha256:digest> <full-lowercase-git-sha>" >&2
  exit 2
fi
for REQUIRED_COMMAND in az git jq openssl realpath; do
  if ! command -v "${REQUIRED_COMMAND}" >/dev/null 2>&1; then
    echo "ERROR: required command is unavailable: ${REQUIRED_COMMAND}" >&2
    exit 1
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
UPSTREAM_PIN_PATH="docs/ops/production-api-upstream-url.sha256"
if [[ -n "${CONSOLE_RELEASE_SNAPSHOT_ROOT:-}" ]]; then
  if [[ "${EXPECTED_COMMIT}" != "${CONSOLE_RELEASE_COMMIT:-}" ||
    "${REPO_ROOT}" != "${CONSOLE_RELEASE_SNAPSHOT_ROOT}" ||
    "$(basename "${REPO_ROOT}")" != workforce-os-console-release.* ||
    ! -f "${REPO_ROOT}/${UPSTREAM_PIN_PATH}" ||
    -L "${REPO_ROOT}/${UPSTREAM_PIN_PATH}" ||
    "$(realpath "${REPO_ROOT}/${UPSTREAM_PIN_PATH}" 2>/dev/null || true)" != "${REPO_ROOT}/${UPSTREAM_PIN_PATH}" ]]; then
    echo "ERROR: Container App verification escaped the private release snapshot" >&2
    exit 1
  fi
  UPSTREAM_PIN_SOURCE="$(<"${REPO_ROOT}/${UPSTREAM_PIN_PATH}")"
else
  if ! UPSTREAM_PIN_SOURCE="$(GIT_NO_REPLACE_OBJECTS=1 git -C "${REPO_ROOT}" show \
    "${EXPECTED_COMMIT}:${UPSTREAM_PIN_PATH}")"; then
    echo "ERROR: reviewed production API upstream pin is missing from ${EXPECTED_COMMIT}" >&2
    exit 1
  fi
fi
PINNED_UPSTREAM_SHA256="$(awk '!/^#/ && NF { print $1; exit }' \
  <<<"${UPSTREAM_PIN_SOURCE}")"
if [[ ! "${PINNED_UPSTREAM_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: production API upstream is not configured in reviewed source" >&2
  exit 1
fi

APP_JSON="$(az containerapp show \
  --name "${APP}" \
  --resource-group "${RESOURCE_GROUP}" \
  --output json)"

json_value() {
  local expression=$1
  jq -er "${expression}" <<<"${APP_JSON}"
}

env_value() {
  local name=$1
  jq -er --arg name "${name}" '
    [ .properties.template.containers[0].env[]? | select(.name == $name) ]
    | if length == 0 then ""
      elif length == 1 and (.[0].secretRef // "") == "" then (.[0].value // "")
      else error("missing, duplicate, or secret-backed value")
      end
  ' <<<"${APP_JSON}"
}

probe_path() {
  local type=$1
  jq -er --arg type "${type}" '
    [ .properties.template.containers[0].probes[]? | select(.type == $type) ]
    | if length == 1
         and (.[0].httpGet.port == 8080)
         and ((.[0].httpGet.scheme // "HTTP") == "HTTP")
      then .[0].httpGet.path
      else error("missing, duplicate, or invalid HTTP probe")
      end
  ' <<<"${APP_JSON}"
}

require_value() {
  local actual=$1
  local expected=$2
  local label=$3
  if [[ "${actual}" != "${expected}" ]]; then
    echo "ERROR: ${label} is not the required release value" >&2
    exit 1
  fi
}

require_value "$(json_value '.properties.configuration.activeRevisionsMode')" "Single" "active revision mode"
require_value "$(json_value '.properties.configuration.ingress.external')" "true" "external ingress"
require_value "$(json_value '(.properties.configuration.ingress.allowInsecure // false)')" "false" "TLS-only ingress"
require_value "$(json_value '.properties.configuration.ingress.targetPort')" "8080" "ingress target port"
require_value "$(json_value '.properties.template.containers | length')" "1" "container count"
require_value "$(json_value '.properties.template.containers[0].image')" "${EXPECTED_IMAGE}" "template image"
MIN_REPLICAS="$(json_value '(.properties.template.scale.minReplicas // 0)')"
if [[ ! "${MIN_REPLICAS}" =~ ^[0-9]+$ ]] || ((MIN_REPLICAS < 1)); then
  echo "ERROR: console minimum replicas must be at least one" >&2
  exit 1
fi

require_value "$(env_value NODE_ENV)" "production" "NODE_ENV"
require_value "$(env_value PORT)" "8080" "PORT"
require_value "$(env_value FE_DIST)" "/app/artifacts/workforce-os/dist/public" "FE_DIST"

DEV_TRUST="$(env_value DEV_TRUST_X_ORG_ID)"
if [[ -n "${DEV_TRUST}" && "${DEV_TRUST}" != "false" ]]; then
  echo "ERROR: DEV_TRUST_X_ORG_ID must be unset or false in production" >&2
  exit 1
fi

API_UPSTREAM_URL="$(env_value API_UPSTREAM_URL)"
if [[ ! "${API_UPSTREAM_URL}" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?/?$ ]]; then
  echo "ERROR: API_UPSTREAM_URL must be a public HTTPS origin without a path" >&2
  exit 1
fi
ACTUAL_UPSTREAM_SHA256="$(printf '%s' "${API_UPSTREAM_URL}" | openssl dgst -sha256 -r | awk '{ print $1 }')"
if [[ "${ACTUAL_UPSTREAM_SHA256}" != "${PINNED_UPSTREAM_SHA256}" ]]; then
  echo "ERROR: API_UPSTREAM_URL does not match the reviewed production origin" >&2
  exit 1
fi

CLERK_JWKS_URL="$(env_value CLERK_JWKS_URL)"
if [[ ! "${CLERK_JWKS_URL}" =~ ^https://[^[:space:]@]+/[^[:space:]]+$ ]]; then
  echo "ERROR: CLERK_JWKS_URL must be an HTTPS URL without credentials" >&2
  exit 1
fi

CLERK_ISSUER="$(env_value CLERK_ISSUER)"
CLERK_DOMAIN="$(env_value CLERK_DOMAIN)"
if [[ -z "${CLERK_ISSUER}" && -z "${CLERK_DOMAIN}" ]]; then
  echo "ERROR: CLERK_ISSUER or CLERK_DOMAIN is required" >&2
  exit 1
fi
for CLERK_ORIGIN in "${CLERK_ISSUER}" "${CLERK_DOMAIN}"; do
  if [[ -n "${CLERK_ORIGIN}" && \
    ! "${CLERK_ORIGIN}" =~ ^(https://)?[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?/?$ ]]; then
    echo "ERROR: Clerk issuer/domain configuration is invalid" >&2
    exit 1
  fi
done

CLERK_PARTIES="$(env_value CLERK_AUTHORIZED_PARTIES)"
if [[ -z "${CLERK_PARTIES}" ]]; then
  echo "ERROR: CLERK_AUTHORIZED_PARTIES must be explicit in production" >&2
  exit 1
fi
IFS=',' read -r -a PARTY_VALUES <<<"${CLERK_PARTIES}"
for PARTY in "${PARTY_VALUES[@]}"; do
  PARTY="${PARTY#"${PARTY%%[![:space:]]*}"}"
  PARTY="${PARTY%"${PARTY##*[![:space:]]}"}"
  if [[ ! "${PARTY}" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?/?$ ]]; then
    echo "ERROR: CLERK_AUTHORIZED_PARTIES contains an invalid origin" >&2
    exit 1
  fi
done

require_value "$(probe_path Liveness)" "/api/healthz" "liveness probe"

LATEST_REVISION="$(json_value '.properties.latestRevisionName')"
READY_REVISION="$(json_value '.properties.latestReadyRevisionName')"
require_value "${READY_REVISION}" "${LATEST_REVISION}" "latest ready revision"

REVISION_JSON="$(az containerapp revision show \
  --name "${APP}" \
  --resource-group "${RESOURCE_GROUP}" \
  --revision "${READY_REVISION}" \
  --output json)"
require_value "$(jq -er '.properties.active' <<<"${REVISION_JSON}")" "true" "revision active state"
require_value "$(jq -er '.properties.healthState' <<<"${REVISION_JSON}")" "Healthy" "revision health"
require_value "$(jq -er '.properties.provisioningState' <<<"${REVISION_JSON}")" "Provisioned" "revision provisioning"
require_value \
  "$(jq -er '.properties.template.containers[0].image' <<<"${REVISION_JSON}")" \
  "${EXPECTED_IMAGE}" \
  "active revision image"

echo "Console Container App configuration verified (immutable image, auth, ingress, probe, active revision)"
