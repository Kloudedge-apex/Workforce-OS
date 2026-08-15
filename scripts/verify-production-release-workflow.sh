#!/usr/bin/env bash

# Statically enforce the fail-closed production release workflow source contract.

set -euo pipefail

workflow_error() {
  echo "ERROR: production release workflow contract failed: $*" >&2
  exit 1
}

require_workflow_line() {
  local workflow_file=$1
  local expected=$2
  local count
  count="$(grep -Fxc -- "${expected}" "${workflow_file}" || true)"
  [[ "${count}" == "1" ]] || workflow_error "expected exactly one line: ${expected}"
}

require_workflow_text() {
  local workflow_file=$1
  local expected=$2
  grep -Fq -- "${expected}" "${workflow_file}" || \
    workflow_error "missing required source contract: ${expected}"
}

require_workflow_order() {
  local workflow_file=$1
  local first=$2
  local second=$3
  local first_line second_line
  first_line="$(grep -nF -- "${first}" "${workflow_file}" | awk -F: 'NR == 1 { print $1 }')"
  second_line="$(grep -nF -- "${second}" "${workflow_file}" | awk -F: 'NR == 1 { print $1 }')"
  if [[ -z "${first_line}" || -z "${second_line}" || "${first_line}" -ge "${second_line}" ]]; then
    workflow_error "expected '${first}' before '${second}'"
  fi
}

verify_workflow_source() {
  local workflow_file=$1
  local action_count authority_mapping_count concurrency_key_count event_names
  local expected_job_keys expected_step_starters expected_top_level_keys
  local input_required_count input_type_count job_keys job_names permission_block_count
  local permission_key_count step_starters top_level_keys vite_key_mapping_count

  for required_command in awk grep; do
    command -v "${required_command}" >/dev/null 2>&1 || \
      workflow_error "required command is unavailable: ${required_command}"
  done
  if [[ ! -f "${workflow_file}" || -L "${workflow_file}" ]]; then
    workflow_error "workflow is missing, not a regular file, or is a symlink: ${workflow_file}"
  fi
  if grep -Ei '^[[:space:]]*continue-on-error:|^[[:space:]]*if:' \
    "${workflow_file}" >/dev/null; then
    workflow_error "release workflow may not suppress failures or conditionally skip admission steps"
  fi
  if grep -Fq '${{ vars.' "${workflow_file}"; then
    workflow_error "release identity and authority may not use repository/org variable fallback contexts"
  fi
  if grep -Eq '(^|[[:space:]])[&*][A-Za-z0-9_-]+([[:space:]]|$)|^[[:space:]]*<<:' \
    "${workflow_file}"; then
    workflow_error "YAML anchors, aliases, and merge keys are forbidden"
  fi
  if grep -Eq '^[[:space:]]*shell:[[:space:]]*' "${workflow_file}"; then
    workflow_error "workflow and step shell overrides are forbidden"
  fi

  expected_top_level_keys="name
on
permissions
concurrency
jobs"
  top_level_keys="$(awk '
    /^[A-Za-z0-9_-]+:/ {
      key = $0
      sub(/:.*/, "", key)
      print key
    }
  ' "${workflow_file}")"
  [[ "${top_level_keys}" == "${expected_top_level_keys}" ]] || \
    workflow_error "top-level keys or their order differ from the protected allowlist"

  require_workflow_line "${workflow_file}" "name: Release Production Console"
  require_workflow_line "${workflow_file}" "on:"
  event_names="$(awk '
    /^on:[[:space:]]*$/ { in_events = 1; next }
    in_events && /^[^[:space:]]/ { exit }
    in_events && /^  [A-Za-z0-9_-]+:/ {
      event = $0
      sub(/^  /, "", event)
      sub(/:.*/, "", event)
      print event
    }
  ' "${workflow_file}")"
  [[ "${event_names}" == "workflow_dispatch" ]] || \
    workflow_error "workflow_dispatch must be the only trigger"
  require_workflow_line "${workflow_file}" "  workflow_dispatch:"
  require_workflow_line "${workflow_file}" "      release_sha:"
  require_workflow_line "${workflow_file}" "      confirmation:"
  input_required_count="$(grep -Fxc "        required: true" "${workflow_file}" || true)"
  input_type_count="$(grep -Fxc "        type: string" "${workflow_file}" || true)"
  [[ "${input_required_count}" == "2" && "${input_type_count}" == "2" ]] || \
    workflow_error "both manual confirmations must be required string inputs"

  permission_block_count="$(grep -Ec '^[[:space:]]*permissions:[[:space:]]*$' \
    "${workflow_file}" || true)"
  [[ "${permission_block_count}" == "1" ]] || \
    workflow_error "workflow must have exactly one top-level permissions block"
  permission_key_count="$(awk '
    /^permissions:[[:space:]]*$/ { in_permissions = 1; next }
    in_permissions && /^[^[:space:]]/ { exit }
    in_permissions && /^  [A-Za-z0-9_-]+:/ { count++ }
    END { print count + 0 }
  ' "${workflow_file}")"
  [[ "${permission_key_count}" == "4" ]] || \
    workflow_error "workflow permissions must contain only four required keys"
  require_workflow_line "${workflow_file}" "  actions: read"
  require_workflow_line "${workflow_file}" "  contents: write"
  require_workflow_line "${workflow_file}" "  deployments: read"
  require_workflow_line "${workflow_file}" "  id-token: write"

  require_workflow_line "${workflow_file}" "concurrency:"
  concurrency_key_count="$(awk '
    /^concurrency:[[:space:]]*$/ { in_concurrency = 1; next }
    in_concurrency && /^[^[:space:]]/ { exit }
    in_concurrency && /^  [A-Za-z0-9_-]+:/ { count++ }
    END { print count + 0 }
  ' "${workflow_file}")"
  [[ "${concurrency_key_count}" == "2" ]] || \
    workflow_error "release concurrency must contain only the fixed group and policy"
  require_workflow_line "${workflow_file}" "  group: workforce-os-production"
  require_workflow_line "${workflow_file}" "  cancel-in-progress: false"

  require_workflow_line "${workflow_file}" "jobs:"
  job_names="$(awk '
    /^jobs:[[:space:]]*$/ { in_jobs = 1; next }
    in_jobs && /^[^[:space:]]/ { exit }
    in_jobs && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ {
      job = $0
      sub(/^  /, "", job)
      sub(/:.*/, "", job)
      print job
    }
  ' "${workflow_file}")"
  [[ "${job_names}" == "release-production" ]] || \
    workflow_error "workflow must contain only the protected release-production job"
  expected_job_keys="name
runs-on
timeout-minutes
environment
steps"
  job_keys="$(awk '
    /^  release-production:[[:space:]]*$/ { in_release_job = 1; next }
    in_release_job && /^  [^[:space:]]/ { exit }
    in_release_job && /^    [A-Za-z0-9_-]+:/ {
      key = $0
      sub(/^    /, "", key)
      sub(/:.*/, "", key)
      print key
    }
  ' "${workflow_file}")"
  [[ "${job_keys}" == "${expected_job_keys}" ]] || \
    workflow_error "release job keys or their order differ from the protected allowlist"
  require_workflow_line "${workflow_file}" "    environment: workforce-os-production"
  require_workflow_line "${workflow_file}" "    runs-on: ubuntu-24.04"

  expected_step_starters="name: Admit protected main release request
name: Audit protected production environment
name: Checkout exact release commit
name: Materialize exact commit as local main
name: Verify production release workflow source
name: Verify reviewed production trust pins
name: Verify exact-commit GitHub CI
name: Azure login with protected OIDC identity
name: Verify Azure release identity
name: Release exact production console commit"
  step_starters="$(awk '
    /^      - / {
      step = $0
      sub(/^      - /, "", step)
      print step
    }
  ' "${workflow_file}")"
  [[ "${step_starters}" == "${expected_step_starters}" ]] || \
    workflow_error "release steps or their order differ from the protected allowlist"

  action_count="$(grep -Ec '^[[:space:]]+uses:[[:space:]]+' "${workflow_file}" || true)"
  [[ "${action_count}" == "2" ]] || \
    workflow_error "workflow must use only the pinned checkout and Azure login actions"
  require_workflow_line "${workflow_file}" \
    "        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0"
  require_workflow_line "${workflow_file}" \
    "        uses: azure/login@a457da9ea143d694b1b9c7c869ebb04ebe844ef5 # v2.3.0"
  if grep -Ei '^[[:space:]]*(creds|client-secret):|AZURE_CREDENTIALS|azure/login@[^0-9a-f]' \
    "${workflow_file}" >/dev/null; then
    workflow_error "Azure login may not use credentials JSON, a client secret, or a mutable ref"
  fi
  if grep -E 'pk_(live|test)_[A-Za-z0-9_-]+' "${workflow_file}" >/dev/null; then
    workflow_error "Clerk publishable key bytes may not be hardcoded in workflow source"
  fi
  require_workflow_line "${workflow_file}" "          persist-credentials: false"
  require_workflow_line "${workflow_file}" '          ref: ${{ inputs.release_sha }}'

  require_workflow_text "${workflow_file}" 'EXPECTED_CONFIRMATION: RELEASE WORKFORCE OS PRODUCTION'
  require_workflow_text "${workflow_file}" 'RELEASE_SHA: ${{ inputs.release_sha }}'
  require_workflow_text "${workflow_file}" 'REF_PROTECTED: ${{ github.ref_protected }}'
  require_workflow_text "${workflow_file}" '[[ ! "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]'
  require_workflow_text "${workflow_file}" '[[ "${RELEASE_SHA}" != "${GITHUB_SHA}" ]]'
  require_workflow_text "${workflow_file}" \
    '[[ "${CONFIRMATION}" != "${EXPECTED_CONFIRMATION}" ]]'
  require_workflow_text "${workflow_file}" '[[ "${GITHUB_REF}" != "refs/heads/main" ]]'
  require_workflow_text "${workflow_file}" '[[ "${REF_PROTECTED}" != "true" ]]'
  require_workflow_text "${workflow_file}" \
    '"repos/${GITHUB_REPOSITORY}/git/ref/heads/main"'

  require_workflow_text "${workflow_file}" '^[0-9a-f]{64}$'
  require_workflow_text "${workflow_file}" 'docs/ops/production-api-upstream-url.sha256'
  require_workflow_text "${workflow_file}" 'docs/ops/production-clerk-auth.sha256'
  require_workflow_text "${workflow_file}" 'docs/ops/production-clerk-publishable-key.sha256'
  require_workflow_order "${workflow_file}" \
    "      - name: Verify reviewed production trust pins" \
    "      - name: Azure login with protected OIDC identity"

  require_workflow_text "${workflow_file}" \
    '"repos/${GITHUB_REPOSITORY}/environments/workforce-os-production"'
  require_workflow_text "${workflow_file}" '.can_admins_bypass == false'
  require_workflow_text "${workflow_file}" 'select(.type == "required_reviewers")'
  require_workflow_text "${workflow_file}" 'select(.prevent_self_review == true)'
  require_workflow_text "${workflow_file}" \
    'select((.reviewers // []) | length > 0)'
  require_workflow_text "${workflow_file}" \
    '.deployment_branch_policy.protected_branches == true'
  require_workflow_text "${workflow_file}" \
    '.deployment_branch_policy.custom_branch_policies == false'
  require_workflow_line "${workflow_file}" "        id: protected_environment"
  require_workflow_text "${workflow_file}" \
    'environments/workforce-os-production/variables/${variable_name}'
  require_workflow_text "${workflow_file}" \
    'select(.name == $expected_name)'
  require_workflow_text "${workflow_file}" \
    'select(type == "string" and length > 0)'
  require_workflow_text "${workflow_file}" \
    'azure_client_id="$(read_environment_variable AZURE_CLIENT_ID)"'
  require_workflow_text "${workflow_file}" \
    'azure_subscription_id="$(read_environment_variable AZURE_SUBSCRIPTION_ID)"'
  require_workflow_text "${workflow_file}" \
    'azure_tenant_id="$(read_environment_variable AZURE_TENANT_ID)"'
  require_workflow_text "${workflow_file}" \
    'exclusive_authority="$(read_environment_variable ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED)"'
  require_workflow_text "${workflow_file}" \
    'production_control_storage_account="$(read_environment_variable WORKFORCE_PRODUCTION_CONTROL_STORAGE_ACCOUNT)"'
  require_workflow_text "${workflow_file}" \
    'production_control_storage_container="$(read_environment_variable WORKFORCE_PRODUCTION_CONTROL_STORAGE_CONTAINER)"'
  require_workflow_text "${workflow_file}" \
    'production_control_storage_blob="$(read_environment_variable WORKFORCE_PRODUCTION_CONTROL_STORAGE_BLOB)"'
  require_workflow_text "${workflow_file}" \
    'production_control_storage_resource_id="$(read_environment_variable WORKFORCE_PRODUCTION_CONTROL_STORAGE_RESOURCE_ID)"'
  require_workflow_text "${workflow_file}" \
    '[[ "${exclusive_authority}" == "true" ]]'
  require_workflow_text "${workflow_file}" \
    '[[ "${production_control_storage_container}" == "production-control" ]]'
  require_workflow_text "${workflow_file}" \
    '[[ "${production_control_storage_blob}" == "workforce-os/initial-production-bootstrap/state-v1.json" ]]'
  require_workflow_text "${workflow_file}" \
    'providers/Microsoft.Storage/storageAccounts/${production_control_storage_account}$'
  require_workflow_text "${workflow_file}" \
    'environments/workforce-os-production/secrets/VITE_CLERK_PUBLISHABLE_KEY"'
  require_workflow_text "${workflow_file}" \
    '.name == "VITE_CLERK_PUBLISHABLE_KEY"'
  require_workflow_text "${workflow_file}" \
    'printf '\''azure_client_id=%s\n'\'' "${azure_client_id}"'
  require_workflow_text "${workflow_file}" \
    'printf '\''azure_subscription_id=%s\n'\'' "${azure_subscription_id}"'
  require_workflow_text "${workflow_file}" \
    'printf '\''azure_tenant_id=%s\n'\'' "${azure_tenant_id}"'
  require_workflow_text "${workflow_file}" \
    'printf '\''exclusive_authority=%s\n'\'' "${exclusive_authority}"'
  require_workflow_text "${workflow_file}" \
    'printf '\''production_control_storage_account=%s\n'\'' "${production_control_storage_account}"'
  require_workflow_text "${workflow_file}" \
    'printf '\''production_control_storage_container=%s\n'\'' "${production_control_storage_container}"'
  require_workflow_text "${workflow_file}" \
    'printf '\''production_control_storage_blob=%s\n'\'' "${production_control_storage_blob}"'
  require_workflow_text "${workflow_file}" \
    'printf '\''production_control_storage_resource_id=%s\n'\'' "${production_control_storage_resource_id}"'
  require_workflow_text "${workflow_file}" '>>"${GITHUB_OUTPUT}"'
  require_workflow_order "${workflow_file}" \
    "      - name: Audit protected production environment" \
    "      - name: Checkout exact release commit"
  require_workflow_order "${workflow_file}" \
    "      - name: Audit protected production environment" \
    "      - name: Azure login with protected OIDC identity"

  require_workflow_line "${workflow_file}" \
    "        run: scripts/verify-production-release-workflow.sh .github/workflows/release-production.yml"
  require_workflow_order "${workflow_file}" \
    "      - name: Materialize exact commit as local main" \
    "      - name: Verify production release workflow source"
  require_workflow_order "${workflow_file}" \
    "      - name: Verify production release workflow source" \
    "      - name: Verify reviewed production trust pins"
  require_workflow_order "${workflow_file}" \
    "      - name: Verify exact-commit GitHub CI" \
    "      - name: Azure login with protected OIDC identity"

  require_workflow_line "${workflow_file}" \
    '          ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED: ${{ steps.protected_environment.outputs.exclusive_authority }}'
  azure_subscription_mapping_count="$(grep -Fxc \
    '          AZURE_SUBSCRIPTION_ID: ${{ steps.protected_environment.outputs.azure_subscription_id }}' \
    "${workflow_file}" || true)"
  [[ "${azure_subscription_mapping_count}" == "2" ]] || \
    workflow_error "Azure subscription identity must be mapped only to verification and release"
  require_workflow_line "${workflow_file}" \
    '          WORKFORCE_PRODUCTION_CONTROL_STORAGE_ACCOUNT: ${{ steps.protected_environment.outputs.production_control_storage_account }}'
  require_workflow_line "${workflow_file}" \
    '          WORKFORCE_PRODUCTION_CONTROL_STORAGE_CONTAINER: ${{ steps.protected_environment.outputs.production_control_storage_container }}'
  require_workflow_line "${workflow_file}" \
    '          WORKFORCE_PRODUCTION_CONTROL_STORAGE_BLOB: ${{ steps.protected_environment.outputs.production_control_storage_blob }}'
  require_workflow_line "${workflow_file}" \
    '          WORKFORCE_PRODUCTION_CONTROL_STORAGE_RESOURCE_ID: ${{ steps.protected_environment.outputs.production_control_storage_resource_id }}'
  authority_mapping_count="$(grep -Ec \
    '^[[:space:]]*ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED:[[:space:]]*' \
    "${workflow_file}" || true)"
  [[ "${authority_mapping_count}" == "1" ]] || \
    workflow_error "authority must have exactly one environment mapping"
  if grep -Ei '\$\{\{[[:space:]]*inputs\.[^}]*authority|\$\{\{[[:space:]]*inputs\.[^}]*ACA_EXCLUSIVE' \
    "${workflow_file}" >/dev/null; then
    workflow_error "exclusive mutation authority may not come from a dispatch input"
  fi

  require_workflow_line "${workflow_file}" \
    '          client-id: ${{ steps.protected_environment.outputs.azure_client_id }}'
  require_workflow_line "${workflow_file}" \
    '          subscription-id: ${{ steps.protected_environment.outputs.azure_subscription_id }}'
  require_workflow_line "${workflow_file}" \
    '          tenant-id: ${{ steps.protected_environment.outputs.azure_tenant_id }}'
  require_workflow_line "${workflow_file}" \
    '          AZURE_CLIENT_ID: ${{ steps.protected_environment.outputs.azure_client_id }}'
  require_workflow_line "${workflow_file}" \
    '          AZURE_TENANT_ID: ${{ steps.protected_environment.outputs.azure_tenant_id }}'
  require_workflow_text "${workflow_file}" 'account_json="$(az account show --output json)"'
  require_workflow_text "${workflow_file}" \
    '(.id | ascii_downcase) == ($subscription_id | ascii_downcase)'
  require_workflow_text "${workflow_file}" \
    '(.tenantId | ascii_downcase) == ($tenant_id | ascii_downcase)'
  require_workflow_text "${workflow_file}" '.user.type == "servicePrincipal"'
  require_workflow_text "${workflow_file}" \
    '(.user.name | ascii_downcase) == ($client_id | ascii_downcase)'
  require_workflow_order "${workflow_file}" \
    "      - name: Azure login with protected OIDC identity" \
    "      - name: Verify Azure release identity"
  require_workflow_order "${workflow_file}" \
    "      - name: Verify Azure release identity" \
    "      - name: Release exact production console commit"

  vite_key_mapping_count="$(grep -Ec \
    '^[[:space:]]*VITE_CLERK_PUBLISHABLE_KEY:[[:space:]]*' \
    "${workflow_file}" || true)"
  [[ "${vite_key_mapping_count}" == "1" ]] || \
    workflow_error "Clerk publishable key must have exactly one workflow mapping"
  require_workflow_line "${workflow_file}" \
    '          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}'
  require_workflow_line "${workflow_file}" "          ./scripts/deploy-console-prod.sh --yes"
  if grep -E '[[:space:]](ba)?sh[[:space:]]+([^[:space:]]+/)?scripts/deploy-console-prod\.sh' \
    "${workflow_file}" >/dev/null; then
    workflow_error "release controller must be invoked directly through its privileged shebang"
  fi

  echo "Production release workflow source verified: ${workflow_file}"
}


if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [workflow-file]" >&2
  exit 2
fi
verify_workflow_source "${1:-.github/workflows/release-production.yml}"
