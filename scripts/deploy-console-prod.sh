#!/bin/bash -p

# Canonical production console rollout. The mutable checkout only selects and
# archives HEAD. The archived controller performs every release check and
# helper invocation from that private exact-commit snapshot.

set -euo pipefail

RELEASE_GIT_BIN="$(type -P git || true)"
if [[ "${RELEASE_GIT_BIN}" != /* || ! -f "${RELEASE_GIT_BIN}" ||
  ! -x "${RELEASE_GIT_BIN}" ]]; then
  echo "ERROR: required external Git executable is unavailable on an absolute PATH entry" >&2
  exit 1
fi

# Run release-critical Git operations without inherited command, repository
# routing, object-store, helper, or attributes overrides. Callers may still
# add explicit -c values after these fixed defaults.
isolated_release_git() (
  unset \
    ALL_PROXY \
    CURL_CA_BUNDLE \
    GIT_ALTERNATE_OBJECT_DIRECTORIES \
    GIT_ASKPASS \
    GIT_ATTR_SOURCE \
    GIT_CEILING_DIRECTORIES \
    GIT_COMMON_DIR \
    GIT_CONFIG \
    GIT_CONFIG_PARAMETERS \
    GIT_CURL_VERBOSE \
    GIT_DIR \
    GIT_DISCOVERY_ACROSS_FILESYSTEM \
    GIT_EXEC_PATH \
    GIT_INDEX_FILE \
    GIT_NAMESPACE \
    GIT_OBJECT_DIRECTORY \
    GIT_PROXY_COMMAND \
    GIT_QUARANTINE_PATH \
    GIT_REPLACE_REF_BASE \
    GIT_SHALLOW_FILE \
    GIT_SSL_CAINFO \
    GIT_SSL_CAPATH \
    GIT_SSL_NO_VERIFY \
    GIT_SSH \
    GIT_SSH_COMMAND \
    GIT_TEMPLATE_DIR \
    GIT_TRACE \
    GIT_TRACE2 \
    GIT_TRACE2_BRIEF \
    GIT_TRACE2_CONFIG_PARAMS \
    GIT_TRACE2_ENV_VARS \
    GIT_TRACE2_EVENT \
    GIT_TRACE2_EVENT_NESTING \
    GIT_TRACE2_PERF \
    GIT_TRACE_CURL \
    GIT_TRACE_CURL_NO_DATA \
    GIT_TRACE_PACKET \
    GIT_TRACE_PACK_ACCESS \
    GIT_TRACE_PACKFILE \
    GIT_TRACE_PERFORMANCE \
    GIT_TRACE_REFS \
    GIT_TRACE_SETUP \
    GIT_WORK_TREE \
    HTTPS_PROXY \
    HTTP_PROXY \
    SSL_CERT_DIR \
    SSL_CERT_FILE \
    all_proxy \
    https_proxy \
    http_proxy \
    SSH_ASKPASS
  export GIT_ATTR_NOSYSTEM=1
  export GIT_CONFIG_COUNT=0
  export GIT_CONFIG_GLOBAL=/dev/null
  export GIT_CONFIG_NOSYSTEM=1
  export GIT_CONFIG_SYSTEM=/dev/null
  export GIT_NO_REPLACE_OBJECTS=1
  export GIT_TERMINAL_PROMPT=0
  export GIT_TRACE_REDACT=1
  export GIT_TRACE2_REDACT=1
  "${RELEASE_GIT_BIN}" \
    -c core.attributesFile=/dev/null \
    -c core.hooksPath=/dev/null \
    "$@"
)

bootstrap_exact_commit_controller() {
  local -a controller_environment
  local archive_git_dir archive_state_dir archive_template bootstrap_script_dir bootstrap_signal_name
  local bootstrap_signal_status branch commit controller controller_pgid controller_pid controller_real
  local controller_status
  local repo_root snapshot_root source_git_common_dir source_object_dir token token_file

  archive_state_dir=""
  bootstrap_signal_name=""
  bootstrap_signal_status=""
  controller_pid=""
  controller_pgid=""

  for required_command in git mktemp openssl realpath tar; do
    if ! command -v "${required_command}" >/dev/null 2>&1; then
      echo "ERROR: required bootstrap command is unavailable: ${required_command}" >&2
      exit 1
    fi
  done

  bootstrap_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  repo_root="$(cd "${bootstrap_script_dir}" && isolated_release_git rev-parse --show-toplevel)"
  cd "${repo_root}"

  branch="$(isolated_release_git rev-parse --abbrev-ref HEAD)"
  commit="$(isolated_release_git rev-parse HEAD)"
  if [[ ! "${commit}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "ERROR: HEAD is not a full lowercase Git SHA" >&2
    exit 1
  fi

  umask 077
  token_file=""
  snapshot_root="$(mktemp -d "${TMPDIR:-/tmp}/workforce-os-console-release.XXXXXX")"
  cleanup_bootstrap_snapshot() {
    local status=$?
    trap - EXIT
    trap '' HUP INT TERM
    set +e
    if [[ -n "${controller_pgid:-}" ]] && kill -0 -- "-${controller_pgid}" 2>/dev/null; then
      kill -TERM -- "-${controller_pgid}" 2>/dev/null || true
    elif [[ -n "${controller_pid:-}" ]] && kill -0 "${controller_pid}" 2>/dev/null; then
      kill -TERM "${controller_pid}" 2>/dev/null || true
    fi
    if [[ -n "${controller_pid:-}" ]]; then
      while kill -0 "${controller_pid}" 2>/dev/null; do
        wait "${controller_pid}" 2>/dev/null || true
      done
      wait "${controller_pid}" 2>/dev/null || true
    fi
    while [[ -n "${controller_pgid:-}" ]] &&
      kill -0 -- "-${controller_pgid}" 2>/dev/null; do
      sleep 0.05
    done
    if [[ -n "${snapshot_root:-}" && -d "${snapshot_root}" &&
      "$(basename "${snapshot_root}")" == workforce-os-console-release.* ]]; then
      rm -rf -- "${snapshot_root}"
    fi
    if [[ -n "${token_file:-}" && -f "${token_file}" &&
      "$(basename "${token_file}")" == workforce-os-console-release-token.* ]]; then
      rm -f -- "${token_file}"
    fi
    if [[ -n "${archive_state_dir:-}" && -d "${archive_state_dir}" &&
      "$(basename "${archive_state_dir}")" == workforce-os-console-archive-state.* ]]; then
      rm -rf -- "${archive_state_dir}"
    fi
    exit "${status}"
  }
  trap cleanup_bootstrap_snapshot EXIT
  snapshot_root="$(cd "${snapshot_root}" && pwd -P)"
  token_file="$(mktemp "${TMPDIR:-/tmp}/workforce-os-console-release-token.XXXXXX")"
  token="$(openssl rand -hex 32)"
  if [[ ! "${token}" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: could not create the private release snapshot admission token" >&2
    exit 1
  fi
  printf '%s\n' "${token}" >"${token_file}"
  chmod 600 "${token_file}"

  source_git_common_dir="$(isolated_release_git rev-parse --git-common-dir)"
  if [[ "${source_git_common_dir}" != /* ]]; then
    source_git_common_dir="${repo_root}/${source_git_common_dir}"
  fi
  source_git_common_dir="$(cd "${source_git_common_dir}" && pwd -P)"
  source_object_dir="$(cd "${source_git_common_dir}/objects" && pwd -P)"

  archive_state_dir="$(mktemp -d "${TMPDIR:-/tmp}/workforce-os-console-archive-state.XXXXXX")"
  archive_git_dir="${archive_state_dir}/archive.git"
  archive_template="${archive_state_dir}/empty-git-template"
  mkdir "${archive_template}"
  isolated_release_git init --quiet --bare --template="${archive_template}" "${archive_git_dir}"
  printf '%s\n' "${source_object_dir}" >"${archive_git_dir}/objects/info/alternates"
  if ! isolated_release_git --git-dir="${archive_git_dir}" cat-file -e "${commit}^{commit}"; then
    echo "ERROR: selected commit is unavailable through the private archive object view" >&2
    exit 1
  fi
  if ! isolated_release_git --git-dir="${archive_git_dir}" archive --format=tar "${commit}" | \
    /usr/bin/env -u TAR_OPTIONS tar -xf - -C "${snapshot_root}"; then
    echo "ERROR: could not create the private exact-commit release snapshot" >&2
    exit 1
  fi

  controller="${snapshot_root}/scripts/deploy-console-prod.sh"
  controller_real="$(realpath "${controller}" 2>/dev/null || true)"
  if [[ "${controller_real}" != "${controller}" || ! -f "${controller}" ||
    -L "${controller}" || ! -x "${controller}" ]]; then
    echo "ERROR: exact-commit release controller is missing or unsafe" >&2
    exit 1
  fi

  controller_environment=(
    /usr/bin/env
    -u BASHOPTS
    -u BASH_COMPAT
    -u BASH_ENV
    -u BASH_XTRACEFD
    -u CDPATH
    -u CURL_CA_BUNDLE
    -u ENV
    -u GH_CONFIG_DIR
    -u GH_DEBUG
    -u GH_REPO
    -u GIT_SSL_CAINFO
    -u GIT_SSL_CAPATH
    -u GIT_SSL_NO_VERIFY
    -u GLOBIGNORE
    -u HTTPS_PROXY
    -u HTTP_PROXY
    -u NO_PROXY
    -u POSIXLY_CORRECT
    -u PS4
    -u SSL_CERT_DIR
    -u SSL_CERT_FILE
    -u SHELLOPTS
    -u ALL_PROXY
    -u all_proxy
    -u http_proxy
    -u https_proxy
    -u no_proxy
  )
  while IFS='=' read -r environment_name _; do
    case "${environment_name}" in
      BASH_FUNC_*%%) controller_environment+=(-u "${environment_name}") ;;
    esac
  done < <(/usr/bin/env)

  forward_bootstrap_signal() {
    local signal=$1
    local status=$2
    local target_pgid="${controller_pgid}"
    local target_pid="${controller_pid}"

    if [[ -z "${bootstrap_signal_status}" ]]; then
      bootstrap_signal_name="${signal}"
      bootstrap_signal_status="${status}"
    fi
    # Bash runs traps only between commands. If the signal lands after the
    # async launch but before controller_pid=$!, recover that exact child from
    # the shell's last-background PID instead of orphaning it.
    if [[ -z "${target_pid}" && -n "${!:-}" ]]; then
      target_pid="$!"
      controller_pid="${target_pid}"
      controller_pgid="${target_pid}"
      target_pgid="${target_pid}"
    fi
    if [[ -z "${target_pgid}" && -n "${target_pid}" ]]; then
      target_pgid="${target_pid}"
      controller_pgid="${target_pgid}"
    fi
    if [[ -n "${target_pgid}" ]] && kill -0 -- "-${target_pgid}" 2>/dev/null; then
      kill -s "${signal}" -- "-${target_pgid}" 2>/dev/null || true
    elif [[ -n "${target_pid}" ]] && kill -0 "${target_pid}" 2>/dev/null; then
      kill -s "${signal}" "${target_pid}" 2>/dev/null || true
    fi
  }
  trap 'forward_bootstrap_signal HUP 129' HUP
  trap 'forward_bootstrap_signal INT 130' INT
  trap 'forward_bootstrap_signal TERM 143' TERM

  set +e
  set -m
  (
    # Async shell jobs can inherit ignored interactive signals. Restore
    # defaults before exec so all three forwarded signals stop the controller.
    trap - HUP INT TERM
    exec "${controller_environment[@]}" \
      CONSOLE_RELEASE_STAGE="exact-commit-controller" \
      CONSOLE_RELEASE_SNAPSHOT_ROOT="${snapshot_root}" \
      CONSOLE_RELEASE_COMMIT="${commit}" \
      CONSOLE_RELEASE_BRANCH="${branch}" \
      CONSOLE_RELEASE_SNAPSHOT_PARENT_PID="$$" \
      CONSOLE_RELEASE_SNAPSHOT_TOKEN="${token}" \
      CONSOLE_RELEASE_SNAPSHOT_TOKEN_FILE="${token_file}" \
      GH_HOST="github.com" \
      GH_PROMPT_DISABLED=1 \
      "${controller}" "$@"
  ) </dev/null &
  controller_pid=$!
  controller_pgid="${controller_pid}"
  set +m
  if [[ -n "${bootstrap_signal_name}" ]]; then
    kill -s "${bootstrap_signal_name}" "${controller_pid}" 2>/dev/null || true
  fi
  while true; do
    wait "${controller_pid}"
    controller_status=$?
    if ! kill -0 "${controller_pid}" 2>/dev/null; then
      break
    fi
  done
  while kill -0 -- "-${controller_pgid}" 2>/dev/null; do
    sleep 0.05
  done
  controller_pid=""
  controller_pgid=""
  set -e
  trap - HUP INT TERM
  if [[ -n "${bootstrap_signal_status}" ]]; then
    exit "${bootstrap_signal_status}"
  fi
  exit "${controller_status}"
}

if [[ "${CONSOLE_RELEASE_STAGE:-}" != "exact-commit-controller" ]]; then
  bootstrap_exact_commit_controller "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
if [[ -z "${CONSOLE_RELEASE_SNAPSHOT_ROOT:-}" ||
  -z "${CONSOLE_RELEASE_SNAPSHOT_TOKEN:-}" ||
  -z "${CONSOLE_RELEASE_SNAPSHOT_TOKEN_FILE:-}" ||
  "${REPO_ROOT}" != "${CONSOLE_RELEASE_SNAPSHOT_ROOT}" ||
  "$(basename "${REPO_ROOT}")" != workforce-os-console-release.* ||
  "${CONSOLE_RELEASE_SNAPSHOT_PARENT_PID:-}" != "${PPID}" ||
  ! -f "${CONSOLE_RELEASE_SNAPSHOT_TOKEN_FILE}" ||
  -L "${CONSOLE_RELEASE_SNAPSHOT_TOKEN_FILE}" ||
  "$(<"${CONSOLE_RELEASE_SNAPSHOT_TOKEN_FILE}")" != "${CONSOLE_RELEASE_SNAPSHOT_TOKEN}" ||
  -e "${REPO_ROOT}/.git" ]]; then
  echo "ERROR: refusing to run release logic outside the private exact-commit snapshot" >&2
  exit 1
fi

COMMIT="${CONSOLE_RELEASE_COMMIT:-}"
BRANCH="${CONSOLE_RELEASE_BRANCH:-}"
if [[ ! "${COMMIT}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: private release snapshot has an invalid commit identity" >&2
  exit 1
fi

SNAPSHOT_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
if [[ "${SNAPSHOT_SCRIPT}" != "${REPO_ROOT}/scripts/deploy-console-prod.sh" ]]; then
  echo "ERROR: release controller is not the private snapshot entrypoint" >&2
  exit 1
fi

cd "${REPO_ROOT}"

REGISTRY="workforceosprodacr"
RESOURCE_GROUP="workforce-os-prod"
ACR_REPO="workforceos-fe"
APP="nikxius-web"
DOCKERFILE="Dockerfile"
RELEASE_LOCK_REPOSITORY="Kloudedge-apex/Workforce-OS"
RELEASE_REMOTE_URL="https://github.com/${RELEASE_LOCK_REPOSITORY}.git"
RELEASE_LOCK_REF="refs/heads/workforce-os-release-lock/production-console"
PRODUCTION_CONTROL_CONTAINER="production-control"
PRODUCTION_CONTROL_BLOB="workforce-os/initial-production-bootstrap/state-v1.json"

if ! command -v realpath >/dev/null 2>&1; then
  echo "ERROR: required snapshot-admission command is unavailable: realpath" >&2
  exit 1
fi
require_snapshot_release_file() {
  local executable=$1
  local relative_path=$2
  local expected_path="${REPO_ROOT}/${relative_path}"
  local resolved_path

  resolved_path="$(realpath "${expected_path}" 2>/dev/null || true)"
  if [[ "${resolved_path}" != "${expected_path}" || ! -f "${expected_path}" ||
    -L "${expected_path}" ]]; then
    echo "ERROR: private snapshot release file is missing or unsafe: ${relative_path}" >&2
    return 1
  fi
  if [[ "${executable}" == "true" && ! -x "${expected_path}" ]]; then
    echo "ERROR: private snapshot release helper is not executable: ${relative_path}" >&2
    return 1
  fi
}
for release_file in \
  Dockerfile \
  docs/ops/production-api-upstream-url.sha256 \
  docs/ops/production-clerk-auth.sha256 \
  docs/ops/production-clerk-publishable-key.sha256; do
  require_snapshot_release_file false "${release_file}" || exit 1
done
for release_helper in \
  scripts/verify-console-containerapp-config.sh \
  scripts/verify-console-image.sh \
  scripts/verify-github-console-release-ci.sh \
  scripts/verify-registry-console-image.sh; do
  require_snapshot_release_file true "${release_helper}" || exit 1
done
run_snapshot_helper() {
  local relative_path=$1
  shift

  require_snapshot_release_file true "${relative_path}" || return 1
  "${REPO_ROOT}/${relative_path}" "$@" || return $?
}

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
if [[ "${ASSUME_YES}" != "true" ]]; then
  echo "ERROR: protected console releases are noninteractive and require --yes" >&2
  exit 2
fi

decode_clerk_frontend_host() {
  local encoded decoded host label
  local -a labels

  if [[ ! "$1" =~ ^pk_live_[A-Za-z0-9_-]+$ ]]; then
    echo "ERROR: VITE_CLERK_PUBLISHABLE_KEY must be a production pk_live key" >&2
    return 1
  fi

  encoded="${1#pk_live_}"
  encoded="${encoded//-/+}"
  encoded="${encoded//_//}"
  case $((${#encoded} % 4)) in
    0) ;;
    2) encoded="${encoded}==" ;;
    3) encoded="${encoded}=" ;;
    *)
      echo "ERROR: production Clerk publishable key encoding is invalid" >&2
      return 1
      ;;
  esac
  if ! decoded="$(printf '%s' "${encoded}" | openssl base64 -d -A 2>/dev/null)" ||
    [[ "${decoded}" != *'$' ]]; then
    echo "ERROR: production Clerk publishable key encoding is invalid" >&2
    return 1
  fi

  host="${decoded%?}"
  if ((${#host} > 253)) || [[ "${host}" != *.* ]]; then
    echo "ERROR: production Clerk publishable key frontend host is invalid" >&2
    return 1
  fi
  IFS='.' read -r -a labels <<<"${host}"
  for label in "${labels[@]}"; do
    if [[ ! "${label}" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
      echo "ERROR: production Clerk publishable key frontend host is invalid" >&2
      return 1
    fi
  done
  printf '%s\n' "${host}"
}

CLERK_FRONTEND_HOST="$(decode_clerk_frontend_host "${VITE_CLERK_PUBLISHABLE_KEY:-}")" || exit 1

VERIFY_ATTEMPTS="${CONSOLE_RELEASE_VERIFY_ATTEMPTS:-30}"
VERIFY_DELAY_SECONDS="${CONSOLE_RELEASE_VERIFY_DELAY_SECONDS:-10}"
if [[ ! "${VERIFY_ATTEMPTS}" =~ ^[1-9][0-9]*$ || ! "${VERIFY_DELAY_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: console release verification timing is invalid" >&2
  exit 1
fi

if [[ "${BRANCH}" != "main" ]]; then
  echo "ERROR: console production ships only from main (current: ${BRANCH})" >&2
  exit 1
fi

require_exclusive_mutation_authority() {
  if [[ "${ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED:-}" != "true" ]]; then
    echo "ERROR: ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=true is required for a production release" >&2
    echo "       set it only after the documented exclusive protected-CI OIDC RBAC audit" >&2
    return 1
  fi
}

# Fail before lease creation or registry artifact creation. The same
# attestation is checked again immediately before every Container App write.
if ! require_exclusive_mutation_authority; then
  exit 1
fi

for REQUIRED_COMMAND in az docker gh git jq mktemp openssl realpath; do
  if ! command -v "${REQUIRED_COMMAND}" >/dev/null 2>&1; then
    echo "ERROR: required command is unavailable: ${REQUIRED_COMMAND}" >&2
    exit 1
  fi
done

REMOTE_COMMIT="$(gh api \
  "repos/${RELEASE_LOCK_REPOSITORY}/git/ref/heads/main" \
  --jq '.object.sha')"
if [[ "${REMOTE_COMMIT}" != "${COMMIT}" ]]; then
  echo "ERROR: snapshot commit ${COMMIT} is not the published origin/main head" >&2
  exit 1
fi

CLERK_KEY_PIN_PATH="docs/ops/production-clerk-publishable-key.sha256"
if [[ ! -f "${REPO_ROOT}/${CLERK_KEY_PIN_PATH}" ||
  -L "${REPO_ROOT}/${CLERK_KEY_PIN_PATH}" ||
  "$(realpath "${REPO_ROOT}/${CLERK_KEY_PIN_PATH}" 2>/dev/null || true)" != "${REPO_ROOT}/${CLERK_KEY_PIN_PATH}" ]]; then
  echo "ERROR: reviewed production Clerk publishable-key pin is missing from ${COMMIT}" >&2
  exit 1
fi
CLERK_KEY_PIN_SOURCE="$(<"${REPO_ROOT}/${CLERK_KEY_PIN_PATH}")"
PINNED_CLERK_KEY_SHA256="$(awk '!/^#/ && NF { print $1; exit }' \
  <<<"${CLERK_KEY_PIN_SOURCE}")"
if [[ ! "${PINNED_CLERK_KEY_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: production Clerk publishable key is not configured in reviewed source" >&2
  exit 1
fi

run_snapshot_helper scripts/verify-github-console-release-ci.sh "${COMMIT}" || exit 1

ACTUAL_CLERK_KEY_SHA256="$(printf '%s' "${VITE_CLERK_PUBLISHABLE_KEY}" | openssl dgst -sha256 -r | awk '{ print $1 }')"
if [[ "${ACTUAL_CLERK_KEY_SHA256}" != "${PINNED_CLERK_KEY_SHA256}" ]]; then
  echo "ERROR: supplied Clerk publishable key does not match reviewed source" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is unavailable; the exact registry artifact cannot be verified" >&2
  exit 1
fi

RELEASE_LOCK_ACQUIRED="false"
RELEASE_LOCK_SAFE_TO_RELEASE="true"
LEASE_GIT_DIR=""
LEASE_GIT_TEMPLATE=""
LEASE_STATE_DIR=""
LEASE_COMMIT=""
ATTEMPT_ID=""
BUILD_CONTEXT="${REPO_ROOT}"
PRODUCTION_MUTATION_LEASE_ACQUIRED="false"
PRODUCTION_MUTATION_LEASE_SAFE_TO_RELEASE="true"
PRODUCTION_MUTATION_LEASE_ID=""

validate_production_mutation_lease_configuration() {
  if [[ ! "${AZURE_SUBSCRIPTION_ID:-}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ||
    ! "${WORKFORCE_PRODUCTION_CONTROL_STORAGE_ACCOUNT:-}" =~ ^[a-z0-9]{3,24}$ ||
    "${WORKFORCE_PRODUCTION_CONTROL_STORAGE_CONTAINER:-}" != "${PRODUCTION_CONTROL_CONTAINER}" ||
    "${WORKFORCE_PRODUCTION_CONTROL_STORAGE_BLOB:-}" != "${PRODUCTION_CONTROL_BLOB}" ||
    ! "${WORKFORCE_PRODUCTION_CONTROL_STORAGE_RESOURCE_ID:-}" =~ ^/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/[A-Za-z0-9._()-]+/providers/Microsoft.Storage/storageAccounts/${WORKFORCE_PRODUCTION_CONTROL_STORAGE_ACCOUNT}$ ]]; then
    echo "ERROR: exact shared production-control lease identity is missing or invalid" >&2
    return 1
  fi
}

production_mutation_blob_lease() {
  local operation=$1
  shift
  az storage blob lease "${operation}" \
    --account-name "${WORKFORCE_PRODUCTION_CONTROL_STORAGE_ACCOUNT}" \
    --container-name "${PRODUCTION_CONTROL_CONTAINER}" \
    --blob-name "${PRODUCTION_CONTROL_BLOB}" \
    --auth-mode login \
    --subscription "${AZURE_SUBSCRIPTION_ID}" \
    --only-show-errors \
    "$@"
}

verify_production_mutation_lease() {
  local returned_lease_id
  returned_lease_id="$(production_mutation_blob_lease renew \
    --lease-id "${PRODUCTION_MUTATION_LEASE_ID}" \
    --query leaseId \
    --output tsv)" || return 1
  [[ "${returned_lease_id}" == "${PRODUCTION_MUTATION_LEASE_ID}" ]]
}

production_mutation_lease_is_released() {
  local lease_json
  lease_json="$(az storage blob show \
    --account-name "${WORKFORCE_PRODUCTION_CONTROL_STORAGE_ACCOUNT}" \
    --container-name "${PRODUCTION_CONTROL_CONTAINER}" \
    --name "${PRODUCTION_CONTROL_BLOB}" \
    --auth-mode login \
    --subscription "${AZURE_SUBSCRIPTION_ID}" \
    --only-show-errors \
    --query properties.lease \
    --output json)" || return 1
  jq -e '
    .status == "unlocked"
    and (.state == "available" or .state == "expired" or .state == "broken")
  ' >/dev/null <<<"${lease_json}"
}

acquire_production_mutation_lease() {
  local returned_lease_id
  returned_lease_id="$(production_mutation_blob_lease acquire \
    --lease-duration -1 \
    --proposed-lease-id "${PRODUCTION_MUTATION_LEASE_ID}" \
    --query leaseId \
    --output tsv)" || {
      # A successful acquire can lose its acknowledgement. Exact-ID renewal
      # adopts only this attempt; it never breaks or steals another lease.
      verify_production_mutation_lease || return 1
      PRODUCTION_MUTATION_LEASE_ACQUIRED="true"
      return 0
    }
  if [[ "${returned_lease_id}" != "${PRODUCTION_MUTATION_LEASE_ID}" ]]; then
    echo "ERROR: shared production mutation lease returned a different owner identity" >&2
    return 1
  fi
  PRODUCTION_MUTATION_LEASE_ACQUIRED="true"
}

release_production_mutation_lease() {
  if production_mutation_blob_lease release \
    --lease-id "${PRODUCTION_MUTATION_LEASE_ID}" \
    --output none; then
    PRODUCTION_MUTATION_LEASE_ACQUIRED="false"
    return 0
  fi
  # Adopt a lost release acknowledgement only from a provider readback that
  # proves no lease is currently held. Never break or delete the state blob.
  if production_mutation_lease_is_released; then
    PRODUCTION_MUTATION_LEASE_ACQUIRED="false"
    return 0
  fi
  return 1
}

lease_git() {
  isolated_release_git \
    -c credential.helper= \
    -c credential.interactive=false \
    -c 'credential.https://github.com.helper=!gh auth git-credential' \
    -c http.sslVerify=true \
    "$@"
}

cleanup_release_resources() {
  local status=$?
  local azure_lease_owned="false"
  trap - EXIT
  set +e
  if [[ "${PRODUCTION_MUTATION_LEASE_ACQUIRED:-false}" == "true" &&
    "${PRODUCTION_MUTATION_LEASE_SAFE_TO_RELEASE:-false}" == "true" ]]; then
    if verify_production_mutation_lease; then
      azure_lease_owned="true"
    else
      echo "ERROR: shared production mutation lease ownership was lost during cleanup" >&2
      echo "       retaining the repository lock as an incident marker" >&2
      PRODUCTION_MUTATION_LEASE_SAFE_TO_RELEASE="false"
      RELEASE_LOCK_SAFE_TO_RELEASE="false"
      status=1
    fi
  fi
  if [[ "${RELEASE_LOCK_ACQUIRED:-false}" == "true" &&
    "${RELEASE_LOCK_SAFE_TO_RELEASE:-false}" == "true" &&
    "${azure_lease_owned}" == "true" ]]; then
    if lease_git \
      --git-dir="${LEASE_GIT_DIR}" \
      push --porcelain \
      --force-with-lease="${RELEASE_LOCK_REF}:${LEASE_COMMIT}" \
      origin ":${RELEASE_LOCK_REF}" >/dev/null 2>&1; then
      RELEASE_LOCK_ACQUIRED="false"
    else
      echo "WARNING: conditional console release lease cleanup failed; the lease was not removed" >&2
      echo "         confirm its unique attempt identity before any separately authorized removal" >&2
      if ((status == 0)); then
        status=1
      fi
      PRODUCTION_MUTATION_LEASE_SAFE_TO_RELEASE="false"
    fi
  elif [[ "${RELEASE_LOCK_ACQUIRED:-false}" == "true" ]]; then
    echo "ERROR: retaining the console release lease because rollout state is uncertain" >&2
    echo "       investigate Azure state before separately authorizing lease removal" >&2
  fi
  if [[ "${PRODUCTION_MUTATION_LEASE_ACQUIRED:-false}" == "true" &&
    "${PRODUCTION_MUTATION_LEASE_SAFE_TO_RELEASE:-false}" == "true" &&
    "${RELEASE_LOCK_ACQUIRED:-false}" == "false" &&
    "${azure_lease_owned}" == "true" ]]; then
    if ! release_production_mutation_lease; then
      echo "ERROR: exact shared production mutation lease cleanup failed" >&2
      echo "       do not break the lease; investigate its exact owner identity" >&2
      status=1
    fi
  elif [[ "${PRODUCTION_MUTATION_LEASE_ACQUIRED:-false}" == "true" ]]; then
    echo "ERROR: retaining the shared Azure production mutation lease because release state is uncertain" >&2
    echo "       investigate both repositories and Azure before separately authorizing cleanup" >&2
  fi
  if [[ -n "${LEASE_STATE_DIR:-}" && -d "${LEASE_STATE_DIR}" &&
    "$(basename "${LEASE_STATE_DIR}")" == workforce-os-console-lease-state.* ]]; then
    rm -rf -- "${LEASE_STATE_DIR}"
  fi
  exit "${status}"
}
trap cleanup_release_resources EXIT

validate_production_mutation_lease_configuration || exit 1
ATTEMPT_ID="$(openssl rand -hex 16)"
if [[ ! "${ATTEMPT_ID}" =~ ^[0-9a-f]{32}$ ]]; then
  echo "ERROR: could not construct a unique console release lease identity" >&2
  exit 1
fi
PRODUCTION_MUTATION_LEASE_ID="${ATTEMPT_ID:0:8}-${ATTEMPT_ID:8:4}-${ATTEMPT_ID:12:4}-${ATTEMPT_ID:16:4}-${ATTEMPT_ID:20:12}"
if ! acquire_production_mutation_lease; then
  echo "ERROR: shared Azure production mutation lease is held or could not be acquired" >&2
  echo "       inspect the fixed production-control blob; never break it during an active release" >&2
  exit 1
fi

umask 077
LEASE_STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/workforce-os-console-lease-state.XXXXXX")"
LEASE_GIT_DIR="${LEASE_STATE_DIR}/lease.git"
LEASE_GIT_TEMPLATE="${LEASE_STATE_DIR}/empty-git-template"
mkdir "${LEASE_GIT_TEMPLATE}"
lease_git init --quiet --bare --template="${LEASE_GIT_TEMPLATE}" "${LEASE_GIT_DIR}"
lease_git --git-dir="${LEASE_GIT_DIR}" remote add origin "${RELEASE_REMOTE_URL}"
if ! lease_git \
  --git-dir="${LEASE_GIT_DIR}" \
  fetch --quiet --no-tags --depth=1 origin refs/heads/main; then
  echo "ERROR: could not fetch the published console release commit" >&2
  exit 1
fi
FETCHED_RELEASE_COMMIT="$(lease_git --git-dir="${LEASE_GIT_DIR}" rev-parse FETCH_HEAD)"
if [[ "${FETCHED_RELEASE_COMMIT}" != "${COMMIT}" ]]; then
  echo "ERROR: origin/main advanced before the release lease was acquired" >&2
  exit 1
fi
LEASE_TREE="$(lease_git --git-dir="${LEASE_GIT_DIR}" rev-parse "${COMMIT}^{tree}")"
if [[ ! "${LEASE_TREE}" =~ ^[0-9a-f]{40}$ ||
  ! "${ATTEMPT_ID}" =~ ^[0-9a-f]{32}$ ]]; then
  echo "ERROR: could not construct a unique console release lease identity" >&2
  exit 1
fi
LEASE_COMMIT="$(
  printf 'Workforce OS production console lease\n\nattempt: %s\nrelease: %s\n' \
    "${ATTEMPT_ID}" "${COMMIT}" | \
    GIT_AUTHOR_NAME="Workforce OS release controller" \
      GIT_AUTHOR_EMAIL="release-controller@workforceos.invalid" \
      GIT_COMMITTER_NAME="Workforce OS release controller" \
      GIT_COMMITTER_EMAIL="release-controller@workforceos.invalid" \
      lease_git --git-dir="${LEASE_GIT_DIR}" commit-tree "${LEASE_TREE}" -p "${COMMIT}"
)"
if [[ ! "${LEASE_COMMIT}" =~ ^[0-9a-f]{40}$ || "${LEASE_COMMIT}" == "${COMMIT}" ]]; then
  echo "ERROR: generated console release lease identity is invalid" >&2
  exit 1
fi

# An explicit empty expected value makes acquisition create-if-absent even if
# an existing lock ref happens to be an ancestor of this unique lease commit.
if ! lease_git \
  --git-dir="${LEASE_GIT_DIR}" \
  push --porcelain \
  --force-with-lease="${RELEASE_LOCK_REF}:" \
  origin "${LEASE_COMMIT}:${RELEASE_LOCK_REF}" >/dev/null 2>&1; then
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
run_snapshot_helper scripts/verify-console-containerapp-config.sh \
  "${PREVIOUS_IMAGE}" "${COMMIT}" "${CLERK_FRONTEND_HOST}" || exit 1

TAG="${COMMIT}"
TAGGED_IMAGE="${REGISTRY}.azurecr.io/${ACR_REPO}:${TAG}"

echo "Branch    : ${BRANCH}"
echo "Commit    : ${COMMIT}"
echo "Build tag : ${TAGGED_IMAGE}"
echo "App       : ${APP} (rg ${RESOURCE_GROUP})"
echo "Prior image: ${PREVIOUS_IMAGE}"

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
run_snapshot_helper scripts/verify-registry-console-image.sh \
  "${IMAGE}" \
  "${COMMIT}" \
  "${PINNED_CLERK_KEY_SHA256}" || exit 1

# Refuse to overwrite a release that appeared while the ACR build and registry
# verification were running. Recheck both identity and release posture as late
# as possible before the only production mutation.
CURRENT_REMOTE_COMMIT="$(gh api \
  "repos/${RELEASE_LOCK_REPOSITORY}/git/ref/heads/main" \
  --jq '.object.sha')"
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
run_snapshot_helper scripts/verify-console-containerapp-config.sh \
  "${PREVIOUS_IMAGE}" "${COMMIT}" "${CLERK_FRONTEND_HOST}" || exit 1

wait_for_release() {
  local expected_image=$1
  local attempt
  for ((attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++)); do
    if run_snapshot_helper scripts/verify-console-containerapp-config.sh \
      "${expected_image}" "${COMMIT}" "${CLERK_FRONTEND_HOST}" >/dev/null 2>&1; then
      run_snapshot_helper scripts/verify-console-containerapp-config.sh \
        "${expected_image}" "${COMMIT}" "${CLERK_FRONTEND_HOST}" || return 1
      return 0
    fi
    if ((attempt < VERIFY_ATTEMPTS)); then
      sleep "${VERIFY_DELAY_SECONDS}"
    fi
  done
  run_snapshot_helper scripts/verify-console-containerapp-config.sh \
    "${expected_image}" "${COMMIT}" "${CLERK_FRONTEND_HOST}" || return $?
}

UPDATE_ATTEMPTED="false"
rollback_console() {
  local status=${1:-1}
  local rollback_failed="false"
  local current_image=""
  trap - ERR
  trap '' HUP INT TERM
  set +e
  echo "ERROR: console rollout did not complete; restoring ${PREVIOUS_IMAGE}" >&2
  if [[ "${UPDATE_ATTEMPTED}" == "true" ]]; then
    current_image="$(az containerapp show \
      --name "${APP}" \
      --resource-group "${RESOURCE_GROUP}" \
      --query 'properties.template.containers[0].image' \
      --output tsv)" || rollback_failed="true"
    if [[ "${current_image}" == "${IMAGE}" ]]; then
      if require_exclusive_mutation_authority && az containerapp update \
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

# The stable Container Apps PATCH contract does not expose an ETag/If-Match
# precondition. Under the documented exclusive-writer RBAC invariant, repeat
# the exact image read immediately before the cooperative serialized write.
PREWRITE_IMAGE="$(az containerapp show \
  --name "${APP}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query 'properties.template.containers[0].image' \
  --output tsv)"
if [[ "${PREWRITE_IMAGE}" != "${PREVIOUS_IMAGE}" ]]; then
  echo "ERROR: console image changed at the final pre-write read; refusing to overwrite it" >&2
  echo "Captured image : ${PREVIOUS_IMAGE}" >&2
  echo "Pre-write image: ${PREWRITE_IMAGE:-<missing>}" >&2
  exit 1
fi
if ! require_exclusive_mutation_authority; then
  exit 1
fi

RELEASE_LOCK_SAFE_TO_RELEASE="false"
PRODUCTION_MUTATION_LEASE_SAFE_TO_RELEASE="false"
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
PRODUCTION_MUTATION_LEASE_SAFE_TO_RELEASE="true"

cat <<EOF

Deployed and read back ${IMAGE} on ${APP}.

Retain the ACR run ID, digest, GitHub CI run, and operator log with the release
evidence. Then perform the authorized fresh-tenant and cross-org browser smoke;
this source guard does not claim those live product gates passed.
EOF
