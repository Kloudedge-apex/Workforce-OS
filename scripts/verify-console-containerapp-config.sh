#!/usr/bin/env bash

# Read-only verification of the production console Container App. Environment
# values are evaluated in-memory and never printed.

set -euo pipefail

EXPECTED_IMAGE="${1:-}"
EXPECTED_COMMIT="${2:-}"
EXPECTED_CLERK_FRONTEND_HOST="${3:-}"
RESOURCE_GROUP="workforce-os-prod"
APP="nikxius-web"

valid_dns_hostname() {
  local host=$1
  local label
  local -a labels

  ((${#host} <= 253)) && [[ "${host}" == *.* ]] || return 1
  IFS='.' read -r -a labels <<<"${host}"
  for label in "${labels[@]}"; do
    [[ "${label}" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || return 1
  done
}

if [[ ! "${EXPECTED_IMAGE}" =~ ^workforceosprodacr\.azurecr\.io/workforceos-fe@sha256:[0-9a-f]{64}$ ||
  ! "${EXPECTED_COMMIT}" =~ ^[0-9a-f]{40}$ ]] ||
  ! valid_dns_hostname "${EXPECTED_CLERK_FRONTEND_HOST}"; then
  echo "Usage: $0 <workforceosprodacr.azurecr.io/workforceos-fe@sha256:digest> <full-lowercase-git-sha> <clerk-frontend-host>" >&2
  exit 2
fi
for REQUIRED_COMMAND in az git jq openssl realpath; do
  if ! command -v "${REQUIRED_COMMAND}" >/dev/null 2>&1; then
    echo "ERROR: required command is unavailable: ${REQUIRED_COMMAND}" >&2
    exit 1
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
UPSTREAM_PIN_PATH="docs/ops/production-api-upstream-url.sha256"
CLERK_AUTH_PIN_PATH="docs/ops/production-clerk-auth.sha256"
CLERK_AUTH_PIN_VERSION="workforce-os-clerk-auth.v1"
if [[ -n "${CONSOLE_RELEASE_SNAPSHOT_ROOT:-}" ]]; then
  if [[ "${EXPECTED_COMMIT}" != "${CONSOLE_RELEASE_COMMIT:-}" ||
    "${REPO_ROOT}" != "${CONSOLE_RELEASE_SNAPSHOT_ROOT}" ||
    "$(basename "${REPO_ROOT}")" != workforce-os-console-release.* ]]; then
    echo "ERROR: Container App verification escaped the private release snapshot" >&2
    exit 1
  fi
  for PIN_PATH in "${UPSTREAM_PIN_PATH}" "${CLERK_AUTH_PIN_PATH}"; do
    if [[ ! -f "${REPO_ROOT}/${PIN_PATH}" ||
      -L "${REPO_ROOT}/${PIN_PATH}" ||
      "$(realpath "${REPO_ROOT}/${PIN_PATH}" 2>/dev/null || true)" != "${REPO_ROOT}/${PIN_PATH}" ]]; then
      echo "ERROR: Container App verification escaped the private release snapshot" >&2
      exit 1
    fi
  done
  UPSTREAM_PIN_SOURCE="$(<"${REPO_ROOT}/${UPSTREAM_PIN_PATH}")"
  CLERK_AUTH_PIN_SOURCE="$(<"${REPO_ROOT}/${CLERK_AUTH_PIN_PATH}")"
else
  if ! UPSTREAM_PIN_SOURCE="$(GIT_NO_REPLACE_OBJECTS=1 git -C "${REPO_ROOT}" show \
    "${EXPECTED_COMMIT}:${UPSTREAM_PIN_PATH}")"; then
    echo "ERROR: reviewed production API upstream pin is missing from ${EXPECTED_COMMIT}" >&2
    exit 1
  fi
  if ! CLERK_AUTH_PIN_SOURCE="$(GIT_NO_REPLACE_OBJECTS=1 git -C "${REPO_ROOT}" show \
    "${EXPECTED_COMMIT}:${CLERK_AUTH_PIN_PATH}")"; then
    echo "ERROR: reviewed production Clerk auth pin is missing from ${EXPECTED_COMMIT}" >&2
    exit 1
  fi
fi
PINNED_UPSTREAM_SHA256="$(awk '!/^#/ && NF { print $1; exit }' \
  <<<"${UPSTREAM_PIN_SOURCE}")"
if [[ ! "${PINNED_UPSTREAM_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: production API upstream is not configured in reviewed source" >&2
  exit 1
fi
PINNED_CLERK_AUTH_SHA256="$(awk '!/^[[:space:]]*#/ && NF { print }' \
  <<<"${CLERK_AUTH_PIN_SOURCE}")"
if [[ ! "${PINNED_CLERK_AUTH_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: production Clerk auth is not configured in reviewed source" >&2
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
require_value "$(json_value '(.properties.template.containers[0].command // []) | length')" "0" "container command override count"
require_value "$(json_value '(.properties.template.containers[0].args // []) | length')" "0" "container argument override count"
require_value "$(json_value '(.properties.template.containers[0].volumeMounts // []) | length')" "0" "container volume mount count"
require_value "$(json_value '(.properties.template.initContainers // []) | length')" "0" "init container count"
require_value "$(json_value '(.properties.template.volumes // []) | length')" "0" "template volume count"
MIN_REPLICAS="$(json_value '(.properties.template.scale.minReplicas // 0)')"
if [[ ! "${MIN_REPLICAS}" =~ ^[0-9]+$ ]] || ((MIN_REPLICAS < 1)); then
  echo "ERROR: console minimum replicas must be at least one" >&2
  exit 1
fi

runtime_env_contract() {
  local document=$1
  jq -e '
    (.properties.template.containers[0].env // []) as $env
    | [
        "API_UPSTREAM_URL",
        "CLERK_AUDIENCE",
        "CLERK_AUTHORIZED_PARTIES",
        "CLERK_DOMAIN",
        "CLERK_ISSUER",
        "CLERK_JWKS_URL",
        "DEV_TRUST_X_ORG_ID",
        "FE_DIST",
        "NODE_ENV",
        "PORT"
      ] as $allowed
    | ($env | length) == ($env | map(.name) | unique | length)
      and ($env | all(
        . as $entry
        | ($entry.name | type) == "string"
          and ($allowed | index($entry.name)) != null
          and (($entry.secretRef // "") == "")
          and ($entry.value | type) == "string"
      ))
  ' >/dev/null <<<"${document}"
}

# The console/BFF has no runtime secrets and needs only this reviewed public
# configuration. Reject every extra variable, including TLS, proxy, and
# NODE_OPTIONS modifiers that could change the meaning of the pinned origins or
# the process launched from the verified image.
if ! runtime_env_contract "${APP_JSON}"; then
  echo "ERROR: console runtime environment contains a duplicate, secret-backed, or unreviewed variable" >&2
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
CLERK_AUDIENCE="$(env_value CLERK_AUDIENCE)"
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
require_value \
  "${CLERK_ISSUER}" \
  "https://${EXPECTED_CLERK_FRONTEND_HOST}" \
  "Clerk issuer bound to the publishable key"
require_value \
  "${CLERK_JWKS_URL}" \
  "https://${EXPECTED_CLERK_FRONTEND_HOST}/.well-known/jwks.json" \
  "Clerk JWKS URL bound to the publishable key"

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

ACTUAL_CLERK_AUTH_SHA256="$({
  printf '%s\0' \
    "${CLERK_AUTH_PIN_VERSION}" \
    "CLERK_JWKS_URL=${CLERK_JWKS_URL}" \
    "CLERK_ISSUER=${CLERK_ISSUER}" \
    "CLERK_DOMAIN=${CLERK_DOMAIN}" \
    "CLERK_AUDIENCE=${CLERK_AUDIENCE}" \
    "CLERK_AUTHORIZED_PARTIES=${CLERK_PARTIES}"
} | openssl dgst -sha256 -r | awk '{ print $1 }')"
if [[ "${ACTUAL_CLERK_AUTH_SHA256}" != "${PINNED_CLERK_AUTH_SHA256}" ]]; then
  echo "ERROR: Clerk auth configuration does not match reviewed source" >&2
  exit 1
fi

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
if ! runtime_env_contract "${REVISION_JSON}"; then
  echo "ERROR: active revision environment contains a duplicate, secret-backed, or unreviewed variable" >&2
  exit 1
fi
if ! jq -e -s '
  def env_pairs:
    (.properties.template.containers[0].env // [])
    | map({name: .name, value: .value})
    | sort_by(.name);
  (.[0] | env_pairs) == (.[1] | env_pairs)
' >/dev/null \
  <(printf '%s\n' "${APP_JSON}") \
  <(printf '%s\n' "${REVISION_JSON}"); then
  echo "ERROR: active revision environment differs from the verified template" >&2
  exit 1
fi
require_value "$(jq -er '.properties.template.containers | length' <<<"${REVISION_JSON}")" "1" "active revision container count"
require_value \
  "$(jq -er '.properties.template.containers[0].image' <<<"${REVISION_JSON}")" \
  "${EXPECTED_IMAGE}" \
  "active revision image"
require_value "$(jq -er '(.properties.template.containers[0].command // []) | length' <<<"${REVISION_JSON}")" "0" "active revision command override count"
require_value "$(jq -er '(.properties.template.containers[0].args // []) | length' <<<"${REVISION_JSON}")" "0" "active revision argument override count"
require_value "$(jq -er '(.properties.template.containers[0].volumeMounts // []) | length' <<<"${REVISION_JSON}")" "0" "active revision volume mount count"
require_value "$(jq -er '(.properties.template.initContainers // []) | length' <<<"${REVISION_JSON}")" "0" "active revision init container count"
require_value "$(jq -er '(.properties.template.volumes // []) | length' <<<"${REVISION_JSON}")" "0" "active revision volume count"

echo "Console Container App configuration verified (immutable image, auth, ingress, probe, active revision)"
