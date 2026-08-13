#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_DIRS=()
TESTS_PASSED=0

cleanup() {
  local dir
  set +u
  for dir in "${TEMP_DIRS[@]}"; do
    rm -rf -- "${dir}"
  done
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

assert_contains() {
  local file=$1
  local expected=$2
  grep -Fq -- "${expected}" "${file}" || fail "${file} is missing: ${expected}"
}

assert_excludes() {
  local file=$1
  local forbidden=$2
  if grep -Fq -- "${forbidden}" "${file}"; then
    fail "${file} unexpectedly contains: ${forbidden}"
  fi
}

assert_before() {
  local file=$1
  local first=$2
  local second=$3
  local first_line second_line
  first_line="$(grep -nF -- "${first}" "${file}" | head -n 1 | cut -d: -f1)"
  second_line="$(grep -nF -- "${second}" "${file}" | head -n 1 | cut -d: -f1)"
  [[ -n "${first_line}" && -n "${second_line}" && ${first_line} -lt ${second_line} ]] ||
    fail "expected '${first}' before '${second}'"
}

test_source_contract() {
  assert_contains "${REPO_ROOT}/Dockerfile" \
    "# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32"
  assert_contains "${REPO_ROOT}/Dockerfile" \
    "ARG NODE_IMAGE=node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03"
  assert_contains "${REPO_ROOT}/Dockerfile" 'org.opencontainers.image.revision="${VCS_REF}"'
  assert_contains "${REPO_ROOT}/Dockerfile" 'io.workforceos.clerk-publishable-key.sha256="${VITE_CLERK_PUBLISHABLE_KEY_SHA256}"'
  assert_contains "${REPO_ROOT}/Dockerfile" "USER node"
  assert_excludes "${REPO_ROOT}/Dockerfile" "FROM node:24-slim"
  assert_contains "${REPO_ROOT}/.github/workflows/ci.yml" "Production Console Image Contract"
  assert_contains "${REPO_ROOT}/.github/workflows/ci.yml" "console-release-scripts.test.sh"
  assert_contains "${REPO_ROOT}/.github/workflows/ci.yml" \
    "scripts/verify-production-release-workflow.sh"
  [[ -x "${REPO_ROOT}/scripts/verify-production-release-workflow.sh" ]] || \
    fail "production release workflow verifier is not executable"
  assert_contains "${REPO_ROOT}/docs/ops/production-clerk-auth.sha256" \
    "5eddc3f498e16df540776fa025bef86f741fae6815abfb9dd80652026b8956ad"
  assert_contains "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
    'CLERK_AUTH_PIN_VERSION="workforce-os-clerk-auth.v1"'
  assert_contains "${REPO_ROOT}/scripts/deploy-console-prod.sh" \
    'protected console releases are noninteractive and require --yes'
  assert_contains "${REPO_ROOT}/scripts/deploy-console-prod.sh" \
    'docs/ops/production-clerk-auth.sha256'
  assert_contains "${REPO_ROOT}/scripts/deploy-console-prod.sh" ') </dev/null &'
  assert_contains "${REPO_ROOT}/scripts/deploy-console-prod.sh" 'target_pid="$!"'
  assert_contains "${REPO_ROOT}/scripts/deploy-console-prod.sh" '-c credential.interactive=false'
  assert_contains "${REPO_ROOT}/scripts/deploy-console-prod.sh" '-c http.sslVerify=true'
  assert_contains "${REPO_ROOT}/scripts/deploy-console-prod.sh" \
    'BASH_FUNC_*%%) controller_environment+=(-u "${environment_name}")'
  assert_contains "${REPO_ROOT}/scripts/deploy-console-prod.sh" '#!/bin/bash -p'
  pass
}

test_clerk_auth_pin_vector() {
  local actual expected
  expected="5eddc3f498e16df540776fa025bef86f741fae6815abfb9dd80652026b8956ad"
  actual="$({
    printf '%s\0' \
      "workforce-os-clerk-auth.v1" \
      "CLERK_JWKS_URL=https://clerk.workforceos.xyz/.well-known/jwks.json" \
      "CLERK_ISSUER=https://clerk.workforceos.xyz" \
      "CLERK_DOMAIN=" \
      "CLERK_AUDIENCE=" \
      "CLERK_AUTHORIZED_PARTIES=https://workforceos.xyz"
  } | openssl dgst -sha256 -r | awk '{ print $1 }')"
  [[ "${actual}" == "${expected}" ]] ||
    fail "Clerk auth canonical test vector changed: ${actual}"
  pass
}

expect_workflow_verifier_rejects() {
  local fixture=$1
  local label=$2
  if "${REPO_ROOT}/scripts/verify-production-release-workflow.sh" \
    "${fixture}" >/dev/null 2>&1; then
    fail "production workflow verifier accepted ${label}"
  fi
  pass
}

test_production_release_workflow_verifier() {
  local harness workflow
  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  workflow="${REPO_ROOT}/.github/workflows/release-production.yml"

  "${REPO_ROOT}/scripts/verify-production-release-workflow.sh" \
    "${workflow}" >/dev/null
  pass

  awk '
    { print }
    $0 == "  workflow_dispatch:" { print "  push:" }
  ' "${workflow}" >"${harness}/automatic-trigger.yml"
  expect_workflow_verifier_rejects \
    "${harness}/automatic-trigger.yml" "an automatic push trigger"

  awk '
    { print }
    $0 == "    steps:" {
      print "      - name: Unreviewed pre-audit command"
      print "        run: echo unsafe"
    }
  ' "${workflow}" >"${harness}/extra-pre-audit-step.yml"
  expect_workflow_verifier_rejects \
    "${harness}/extra-pre-audit-step.yml" "an extra pre-audit run step"

  awk '
    { print }
    $0 == "    environment: workforce-os-production" {
      print "    container: ubuntu:24.04"
    }
  ' "${workflow}" >"${harness}/container-job.yml"
  expect_workflow_verifier_rejects \
    "${harness}/container-job.yml" "a job-level container override"

  awk '
    { print }
    $0 == "    environment: workforce-os-production" {
      print "    strategy: {}"
    }
  ' "${workflow}" >"${harness}/strategy-job.yml"
  expect_workflow_verifier_rejects \
    "${harness}/strategy-job.yml" "a job-level strategy override"

  sed \
    's|actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0|actions/checkout@v4|' \
    "${workflow}" >"${harness}/mutable-action.yml"
  expect_workflow_verifier_rejects \
    "${harness}/mutable-action.yml" "a mutable action reference"

  sed 's|  contents: write|  contents: read|' \
    "${workflow}" >"${harness}/downgraded-permissions.yml"
  expect_workflow_verifier_rejects \
    "${harness}/downgraded-permissions.yml" "downgraded contents permission"

  sed 's|  deployments: read|  deployments: write|' \
    "${workflow}" >"${harness}/deployment-permissions.yml"
  expect_workflow_verifier_rejects \
    "${harness}/deployment-permissions.yml" "non-read deployment permission"

  sed \
    's|ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED: ${{ steps.protected_environment.outputs.exclusive_authority }}|ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED: "true"|' \
    "${workflow}" >"${harness}/hardcoded-authority.yml"
  expect_workflow_verifier_rejects \
    "${harness}/hardcoded-authority.yml" "hardcoded mutation authority"

  sed \
    's|ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED: ${{ steps.protected_environment.outputs.exclusive_authority }}|ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED: ${{ inputs.authority_confirmed }}|' \
    "${workflow}" >"${harness}/input-authority.yml"
  expect_workflow_verifier_rejects \
    "${harness}/input-authority.yml" "dispatch-input mutation authority"

  sed \
    's|client-id: ${{ steps.protected_environment.outputs.azure_client_id }}|client-id: ${{ vars.AZURE_CLIENT_ID }}|' \
    "${workflow}" >"${harness}/fallback-variable.yml"
  expect_workflow_verifier_rejects \
    "${harness}/fallback-variable.yml" "a repository/org variable fallback"

  sed \
    's|select(.prevent_self_review == true)|select(.prevent_self_review == false)|' \
    "${workflow}" >"${harness}/self-review.yml"
  expect_workflow_verifier_rejects \
    "${harness}/self-review.yml" "an environment that allows self-review"

  sed \
    's|environments/workforce-os-production/secrets|actions/secrets|' \
    "${workflow}" >"${harness}/repo-secret-scope.yml"
  expect_workflow_verifier_rejects \
    "${harness}/repo-secret-scope.yml" "a non-environment Clerk secret scope"

  sed \
    's|environments/workforce-os-production/variables/${variable_name}|actions/variables/${variable_name}|' \
    "${workflow}" >"${harness}/repo-variable-scope.yml"
  expect_workflow_verifier_rejects \
    "${harness}/repo-variable-scope.yml" "a non-environment identity variable scope"

  awk '
    { print }
    $0 == "      - name: Checkout exact release commit" {
      print "        shell: sh"
    }
  ' "${workflow}" >"${harness}/shell-override.yml"
  expect_workflow_verifier_rejects \
    "${harness}/shell-override.yml" "a step shell override"

  sed \
    's|    name: Release Production Console|    name: \&release-name Release Production Console|' \
    "${workflow}" >"${harness}/yaml-anchor.yml"
  expect_workflow_verifier_rejects \
    "${harness}/yaml-anchor.yml" "a YAML anchor"

  awk '
    { print }
    $0 == "      - name: Release exact production console commit" {
      print "        continue-on-error: true"
    }
  ' "${workflow}" >"${harness}/continue-on-error.yml"
  expect_workflow_verifier_rejects \
    "${harness}/continue-on-error.yml" "continue-on-error release execution"

  awk '
    { print }
    $0 == "      - name: Release exact production console commit" {
      print "        if: ${{ always() }}"
    }
  ' "${workflow}" >"${harness}/always.yml"
  expect_workflow_verifier_rejects \
    "${harness}/always.yml" "an always-run release step"

  awk '
    { print }
    $0 == "      - name: Verify Azure release identity" {
      print "        if: ${{ false }}"
    }
  ' "${workflow}" >"${harness}/skipped-identity.yml"
  expect_workflow_verifier_rejects \
    "${harness}/skipped-identity.yml" "a conditionally skipped Azure identity check"
}

make_registry_harness() {
  HARNESS="$(mktemp -d)"
  TEMP_DIRS+=("${HARNESS}")
  mkdir -p "${HARNESS}/bin" "${HARNESS}/scripts"
  cp "${REPO_ROOT}/scripts/verify-registry-console-image.sh" "${HARNESS}/scripts/"

  cat >"${HARNESS}/scripts/verify-console-image.sh" <<'EOF'
#!/usr/bin/env bash
printf 'verify-console %s %s %s\n' "$1" "$2" "$3" >>"${CALL_LOG}"
exit "${FAKE_VERIFY_STATUS:-0}"
EOF

  cat >"${HARNESS}/bin/az" <<'EOF'
#!/usr/bin/env bash
printf 'az %s\n' "$*" >>"${CALL_LOG}"
exit 0
EOF

  cat >"${HARNESS}/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >>"${CALL_LOG}"
if [[ "${1:-}" == "info" || "${1:-}" == "pull" ]]; then exit 0; fi
if [[ "${1:-} ${2:-}" == "image inspect" ]]; then
  case "$*" in
    *RepoDigests*) printf '%s\n' "${FAKE_REPO_DIGEST:-${EXPECTED_IMAGE}}" ;;
    *Architecture*) printf '%s\n' "${FAKE_PLATFORM:-linux/amd64}" ;;
    *) exit 1 ;;
  esac
  exit 0
fi
exit 1
EOF

  chmod +x "${HARNESS}/bin/az" "${HARNESS}/bin/docker" \
    "${HARNESS}/scripts/verify-console-image.sh" \
    "${HARNESS}/scripts/verify-registry-console-image.sh"
  CALL_LOG="${HARNESS}/calls.log"
  : >"${CALL_LOG}"
}

test_registry_verifier() {
  local image revision clerk_key_sha256 wrong_image
  image="ledgracr.azurecr.io/workforceos-fe@sha256:$(printf 'a%.0s' {1..64})"
  revision="$(printf 'b%.0s' {1..40})"
  clerk_key_sha256="$(printf 'd%.0s' {1..64})"
  wrong_image="ledgracr.azurecr.io/workforceos-fe@sha256:$(printf 'c%.0s' {1..64})"
  make_registry_harness

  env PATH="${HARNESS}/bin:${PATH}" CALL_LOG="${CALL_LOG}" EXPECTED_IMAGE="${image}" \
    "${HARNESS}/scripts/verify-registry-console-image.sh" \
    "${image}" "${revision}" "${clerk_key_sha256}" >/dev/null
  assert_contains "${CALL_LOG}" "az acr login --name ledgracr --output none"
  assert_contains "${CALL_LOG}" "docker pull --platform linux/amd64 ${image}"
  assert_contains "${CALL_LOG}" "verify-console ${image} ${revision} ${clerk_key_sha256}"
  assert_before "${CALL_LOG}" "docker pull" "verify-console"
  pass

  : >"${CALL_LOG}"
  if env PATH="${HARNESS}/bin:${PATH}" CALL_LOG="${CALL_LOG}" EXPECTED_IMAGE="${image}" \
    "${HARNESS}/scripts/verify-registry-console-image.sh" \
    "ledgracr.azurecr.io/workforceos-fe:${revision}" "${revision}" "${clerk_key_sha256}" >/dev/null 2>&1; then
    fail "registry verifier accepted a mutable tag"
  fi
  assert_excludes "${CALL_LOG}" "az "
  pass

  : >"${CALL_LOG}"
  if env PATH="${HARNESS}/bin:${PATH}" CALL_LOG="${CALL_LOG}" EXPECTED_IMAGE="${image}" \
    FAKE_REPO_DIGEST="${wrong_image}" \
    "${HARNESS}/scripts/verify-registry-console-image.sh" \
    "${image}" "${revision}" "${clerk_key_sha256}" >/dev/null 2>&1; then
    fail "registry verifier accepted a mismatched pulled digest"
  fi
  assert_excludes "${CALL_LOG}" "verify-console"
  pass

  : >"${CALL_LOG}"
  if env PATH="${HARNESS}/bin:${PATH}" CALL_LOG="${CALL_LOG}" EXPECTED_IMAGE="${image}" \
    FAKE_PLATFORM="linux/arm64" \
    "${HARNESS}/scripts/verify-registry-console-image.sh" \
    "${image}" "${revision}" "${clerk_key_sha256}" >/dev/null 2>&1; then
    fail "registry verifier accepted the wrong platform"
  fi
  assert_excludes "${CALL_LOG}" "verify-console"
  pass
}

test_github_ci_verifier() {
  local harness commit
  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  mkdir -p "${harness}/bin" "${harness}/scripts"
  cp "${REPO_ROOT}/scripts/verify-github-console-release-ci.sh" "${harness}/scripts/"
  commit="$(printf 'd%.0s' {1..40})"

  cat >"${harness}/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-} ${2:-}" == "run list" ]]; then
  cat "${RUN_LIST_JSON}"
elif [[ "${1:-} ${2:-}" == "run view" ]]; then
  cat "${RUN_VIEW_JSON}"
else
  exit 1
fi
EOF
  chmod +x "${harness}/bin/gh" "${harness}/scripts/verify-github-console-release-ci.sh"

  jq -n --arg commit "${commit}" '[{
    databaseId: 42,
    headSha: $commit,
    status: "completed",
    conclusion: "success",
    event: "push"
  }]' >"${harness}/runs.json"
  jq -n --arg commit "${commit}" '{
    databaseId: 42,
    headSha: $commit,
    status: "completed",
    conclusion: "success",
    event: "push",
    jobs: [
      {name: "Type Check, Test & Build", status: "completed", conclusion: "success"},
      {name: "Production Console Image Contract", status: "completed", conclusion: "success"}
    ]
  }' >"${harness}/run.json"

  env PATH="${harness}/bin:${PATH}" RUN_LIST_JSON="${harness}/runs.json" \
    RUN_VIEW_JSON="${harness}/run.json" \
    "${harness}/scripts/verify-github-console-release-ci.sh" "${commit}" >/dev/null
  pass

  jq '(.jobs[] | select(.name == "Production Console Image Contract").conclusion) = "failure"' \
    "${harness}/run.json" >"${harness}/failed-run.json"
  if env PATH="${harness}/bin:${PATH}" RUN_LIST_JSON="${harness}/runs.json" \
    RUN_VIEW_JSON="${harness}/failed-run.json" \
    "${harness}/scripts/verify-github-console-release-ci.sh" "${commit}" >/dev/null 2>&1; then
    fail "GitHub verifier accepted a failed image-contract job"
  fi
  pass
}

write_containerapp_fixture() {
  local target=$1
  local image=$2
  jq -n --arg image "${image}" '{
    properties: {
      configuration: {
        activeRevisionsMode: "Single",
        ingress: {external: true, allowInsecure: false, targetPort: 8080}
      },
      latestRevisionName: "nikxius-web--1",
      latestReadyRevisionName: "nikxius-web--1",
      template: {
        scale: {minReplicas: 1},
        containers: [{
          image: $image,
          env: [
            {name: "NODE_ENV", value: "production"},
            {name: "PORT", value: "8080"},
            {name: "FE_DIST", value: "/app/artifacts/workforce-os/dist/public"},
            {name: "DEV_TRUST_X_ORG_ID", value: "false"},
            {name: "API_UPSTREAM_URL", value: "https://api.workforceos.xyz"},
            {name: "CLERK_JWKS_URL", value: "https://clerk.workforceos.xyz/.well-known/jwks.json"},
            {name: "CLERK_ISSUER", value: "https://clerk.workforceos.xyz"},
            {name: "CLERK_DOMAIN", value: ""},
            {name: "CLERK_AUDIENCE", value: ""},
            {name: "CLERK_AUTHORIZED_PARTIES", value: "https://workforceos.xyz"}
          ],
          probes: [{type: "Liveness", httpGet: {path: "/api/healthz", port: 8080, scheme: "HTTP"}}]
        }]
      }
    }
  }' >"${target}"
}

test_containerapp_verifier() {
  local harness image commit snapshot_root wrong_commit
  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  mkdir -p "${harness}/bin" "${harness}/scripts"
  cp "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" "${harness}/scripts/"
  mkdir -p "${harness}/docs/ops"
  printf '%s\n' f6c46487188a7edd8c8d86cac11db16775ce7b2718875ce0b056b77ca614055d \
    >"${harness}/docs/ops/production-api-upstream-url.sha256"
  printf '%s\n' 5eddc3f498e16df540776fa025bef86f741fae6815abfb9dd80652026b8956ad \
    >"${harness}/docs/ops/production-clerk-auth.sha256"
  git -C "${harness}" init -q
  git -C "${harness}" config user.name "Release Test"
  git -C "${harness}" config user.email "release-test@example.invalid"
  git -C "${harness}" add \
    docs/ops/production-api-upstream-url.sha256 \
    docs/ops/production-clerk-auth.sha256
  git -C "${harness}" commit -q -m "fixture: pin production release trust configuration"
  commit="$(git -C "${harness}" rev-parse HEAD)"
  printf '%s\n' "$(printf 'a%.0s' {1..64})" \
    >"${harness}/docs/ops/production-api-upstream-url.sha256"
  printf '%s\n' "$(printf 'b%.0s' {1..64})" \
    >"${harness}/docs/ops/production-clerk-auth.sha256"
  image="ledgracr.azurecr.io/workforceos-fe@sha256:$(printf 'e%.0s' {1..64})"
  write_containerapp_fixture "${harness}/app.json" "${image}"
  jq -n --arg image "${image}" '{properties: {
    active: true,
    healthState: "Healthy",
    provisioningState: "Provisioned",
    template: {containers: [{image: $image}]}
  }}' >"${harness}/revision.json"

  cat >"${harness}/bin/az" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-} ${2:-}" == "containerapp show" ]]; then
  cat "${APP_JSON_FILE}"
elif [[ "${1:-} ${2:-} ${3:-}" == "containerapp revision show" ]]; then
  cat "${REVISION_JSON_FILE}"
else
  exit 1
fi
EOF
  chmod +x "${harness}/bin/az" "${harness}/scripts/verify-console-containerapp-config.sh"

  env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null
  pass

  jq '(.properties.template.containers[0].env[] | select(.name == "DEV_TRUST_X_ORG_ID").value) = "true"' \
    "${harness}/app.json" >"${harness}/unsafe-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/unsafe-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted the dev auth bypass"
  fi
  pass

  jq '.properties.template.scale.minReplicas = 0' \
    "${harness}/app.json" >"${harness}/scale-zero-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/scale-zero-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted a zero-minimum public console"
  fi
  pass

  jq '.properties.configuration.ingress.allowInsecure = true' \
    "${harness}/app.json" >"${harness}/plaintext-ingress-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/plaintext-ingress-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted plaintext public ingress"
  fi
  pass

  jq '(.properties.template.containers[0].env[] | select(.name == "API_UPSTREAM_URL").value) = "https://attacker.example"' \
    "${harness}/app.json" >"${harness}/unreviewed-upstream-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/unreviewed-upstream-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted an unreviewed bearer-token upstream"
  fi
  pass

  jq '(.properties.template.containers[0].env[] | select(.name == "CLERK_JWKS_URL").value) = "https://attacker.example/.well-known/jwks.json"' \
    "${harness}/app.json" >"${harness}/unreviewed-clerk-jwks-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/unreviewed-clerk-jwks-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted an unreviewed Clerk JWKS URL"
  fi
  pass

  jq '(.properties.template.containers[0].env[] | select(.name == "CLERK_ISSUER").value) = "https://attacker.example"' \
    "${harness}/app.json" >"${harness}/unreviewed-clerk-issuer-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/unreviewed-clerk-issuer-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted an unreviewed Clerk issuer"
  fi
  pass

  jq '(.properties.template.containers[0].env[] | select(.name == "CLERK_DOMAIN").value) = "https://attacker.example"' \
    "${harness}/app.json" >"${harness}/unreviewed-clerk-domain-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/unreviewed-clerk-domain-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted an unreviewed Clerk domain"
  fi
  pass

  jq '(.properties.template.containers[0].env[] | select(.name == "CLERK_AUDIENCE").value) = "attacker-audience"' \
    "${harness}/app.json" >"${harness}/unreviewed-clerk-audience-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/unreviewed-clerk-audience-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted an unreviewed Clerk audience"
  fi
  pass

  jq '(.properties.template.containers[0].env[] | select(.name == "CLERK_AUTHORIZED_PARTIES").value) = "https://attacker.example"' \
    "${harness}/app.json" >"${harness}/unreviewed-clerk-parties-app.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/unreviewed-clerk-parties-app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted unreviewed Clerk authorized parties"
  fi
  pass

  jq '.properties.healthState = "Unhealthy"' \
    "${harness}/revision.json" >"${harness}/unhealthy-revision.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/app.json" \
    REVISION_JSON_FILE="${harness}/unhealthy-revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted an unhealthy revision"
  fi
  pass

  snapshot_root="${harness}/workforce-os-console-release.fixture"
  mkdir -p "${snapshot_root}/scripts" "${snapshot_root}/docs/ops"
  cp "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" "${snapshot_root}/scripts/"
  printf '%s\n' f6c46487188a7edd8c8d86cac11db16775ce7b2718875ce0b056b77ca614055d \
    >"${snapshot_root}/docs/ops/production-api-upstream-url.sha256"
  printf '%s\n' 5eddc3f498e16df540776fa025bef86f741fae6815abfb9dd80652026b8956ad \
    >"${snapshot_root}/docs/ops/production-clerk-auth.sha256"
  chmod +x "${snapshot_root}/scripts/verify-console-containerapp-config.sh"
  snapshot_root="$(cd "${snapshot_root}" && pwd -P)"
  wrong_commit="$(printf 'f%.0s' {1..40})"

  env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    CONSOLE_RELEASE_SNAPSHOT_ROOT="${snapshot_root}" \
    CONSOLE_RELEASE_COMMIT="${commit}" \
    "${snapshot_root}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/app.json" \
    REVISION_JSON_FILE="${harness}/revision.json" \
    CONSOLE_RELEASE_SNAPSHOT_ROOT="${snapshot_root}" \
    CONSOLE_RELEASE_COMMIT="${commit}" \
    "${snapshot_root}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${wrong_commit}" >/dev/null 2>&1; then
    fail "snapshot Container App verifier accepted a different commit identity"
  fi
  pass
}

make_deploy_harness() {
  HARNESS="$(mktemp -d)"
  TEMP_DIRS+=("${HARNESS}")
  mkdir -p "${HARNESS}/bin" "${HARNESS}/repo/scripts" "${HARNESS}/tmp"
  cp "${REPO_ROOT}/scripts/deploy-console-prod.sh" "${HARNESS}/repo/scripts/"
  cp "${REPO_ROOT}/Dockerfile" "${HARNESS}/repo/"

  cat >"${HARNESS}/repo/scripts/verify-github-console-release-ci.sh" <<'EOF'
#!/usr/bin/env bash
printf 'verify-ci %s\n' "$1" >>"${CALL_LOG}"
exit "${FAKE_CI_STATUS:-0}"
EOF

  cat >"${HARNESS}/repo/scripts/verify-registry-console-image.sh" <<'EOF'
#!/usr/bin/env bash
printf 'verify-registry %s %s %s\n' "$1" "$2" "$3" >>"${CALL_LOG}"
exit "${FAKE_REGISTRY_STATUS:-0}"
EOF

  cat >"${HARNESS}/repo/scripts/verify-console-image.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

  cat >"${HARNESS}/repo/scripts/verify-console-containerapp-config.sh" <<'EOF'
#!/usr/bin/env bash
printf 'verify-containerapp %s %s\n' "$1" "$2" >>"${CALL_LOG}"
if [[ "$2" != "${FAKE_COMMIT}" ]]; then
  exit 1
fi
if [[ -n "${FAKE_NEW_IMAGE:-}" && "$1" == "${FAKE_NEW_IMAGE}" ]]; then
  exit "${FAKE_NEW_CONFIG_STATUS:-0}"
fi
exit "${FAKE_CONFIG_STATUS:-0}"
EOF

  cat >"${HARNESS}/bin/git" <<'EOF'
#!/bin/bash -p
while [[ "${1:-}" == "-c" ]]; do
  shift 2
done
printf 'git %s\n' "$*" >>"${CALL_LOG}"
if [[ "${GIT_CONFIG_NOSYSTEM:-}" != "1" ||
  "${GIT_CONFIG_GLOBAL:-}" != "/dev/null" ||
  "${GIT_CONFIG_COUNT:-}" != "0" ||
  "${GIT_ATTR_NOSYSTEM:-}" != "1" ||
  "${GIT_NO_REPLACE_OBJECTS:-}" != "1" ||
  -n "${GIT_CONFIG_PARAMETERS+x}" ||
  -n "${GIT_ATTR_SOURCE+x}" ||
  -n "${GIT_CEILING_DIRECTORIES+x}" ||
  -n "${GIT_COMMON_DIR+x}" ||
  -n "${GIT_DISCOVERY_ACROSS_FILESYSTEM+x}" ||
  -n "${GIT_OBJECT_DIRECTORY+x}" ||
  -n "${GIT_ALTERNATE_OBJECT_DIRECTORIES+x}" ||
  -n "${GIT_INDEX_FILE+x}" ||
  -n "${GIT_NAMESPACE+x}" ||
  -n "${GIT_EXEC_PATH+x}" ||
  -n "${GIT_PROXY_COMMAND+x}" ||
  -n "${GIT_QUARANTINE_PATH+x}" ||
  -n "${GIT_REPLACE_REF_BASE+x}" ||
  -n "${GIT_SHALLOW_FILE+x}" ||
  -n "${GIT_ASKPASS+x}" ||
  -n "${GIT_SSL_NO_VERIFY+x}" ||
  -n "${GIT_TRACE+x}" ||
  -n "${HTTPS_PROXY+x}" ||
  -n "${https_proxy+x}" ||
  -n "${ALL_PROXY+x}" ||
  -n "${all_proxy+x}" ||
  -n "${SSH_ASKPASS+x}" ]]; then
  printf 'release git inherited unsafe configuration or repository routing\n' >&2
  exit 1
fi
if [[ "$*" == *" archive --format=tar ${FAKE_COMMIT}" ||
  "$*" == "archive --format=tar ${FAKE_COMMIT}" ]]; then
  if [[ -n "${FAKE_BOOTSTRAP_PID_FILE:-}" ]]; then
    printf '%s\n' "${PPID}" >"${FAKE_BOOTSTRAP_PID_FILE}"
  fi
  tar -cf - -C "${FAKE_REPO_ROOT}" .
  if [[ "${FAKE_MUTATE_AFTER_ARCHIVE:-false}" == "true" ]]; then
    printf '%s\n' '#!/usr/bin/env bash' 'printf '\''mutable-helper-ran\n'\'' >>"${CALL_LOG}"' 'exit 91' \
      >"${FAKE_REPO_ROOT}/scripts/verify-github-console-release-ci.sh"
    chmod +x "${FAKE_REPO_ROOT}/scripts/verify-github-console-release-ci.sh"
  fi
  exit 0
fi
if [[ "$*" == *"init --quiet --bare"* ]]; then
  target="${@: -1}"
  mkdir -p "${target}/objects/info"
  exit 0
fi
case "${1:-} ${2:-} ${3:-}" in
  "rev-parse --show-toplevel ") printf '%s\n' "${FAKE_REPO_ROOT}" ;;
  "rev-parse --abbrev-ref HEAD") printf '%s\n' "${FAKE_BRANCH}" ;;
  "rev-parse HEAD ") printf '%s\n' "${FAKE_COMMIT}" ;;
  "rev-parse --git-common-dir ") printf '%s\n' "${FAKE_REPO_ROOT}-git-common" ;;
  "diff --quiet ") exit "${FAKE_DIRTY_STATUS:-0}" ;;
  "diff --cached --quiet") exit "${FAKE_DIRTY_STATUS:-0}" ;;
  "status --short --untracked-files=no") exit 0 ;;
  *)
    case "$*" in
      *"init --quiet --bare "*) exit 0 ;;
      *" cat-file -e ${FAKE_COMMIT}^{commit}") exit 0 ;;
      *" remote add origin https://github.com/Kloudedge-apex/Workforce-OS.git") exit 0 ;;
      *" fetch --quiet --no-tags --depth=1 origin refs/heads/main") exit 0 ;;
      *" rev-parse FETCH_HEAD") printf '%s\n' "${FAKE_REMOTE_COMMIT}" ;;
      *" rev-parse ${FAKE_COMMIT}^{tree}") printf '%s\n' "${FAKE_TREE_SHA}" ;;
      *" commit-tree ${FAKE_TREE_SHA} -p ${FAKE_COMMIT}") printf '%s\n' "${FAKE_LEASE_COMMIT}" ;;
      *" push --porcelain --force-with-lease=refs/heads/workforce-os-release-lock/production-console: origin ${FAKE_LEASE_COMMIT}:refs/heads/workforce-os-release-lock/production-console")
        exit "${FAKE_LOCK_STATUS:-0}" ;;
      *" push --porcelain --force-with-lease=refs/heads/workforce-os-release-lock/production-console:${FAKE_LEASE_COMMIT} origin :refs/heads/workforce-os-release-lock/production-console")
        exit "${FAKE_LEASE_CLEANUP_STATUS:-0}" ;;
      *) printf 'unexpected git invocation: %s\n' "$*" >&2; exit 1 ;;
    esac
    ;;
esac
EOF

  cat >"${HARNESS}/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >>"${CALL_LOG}"
[[ "${1:-}" == "info" ]]
EOF

  cat >"${HARNESS}/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "${GH_HOST:-}" != "github.com" || "${GH_PROMPT_DISABLED:-}" != "1" ||
  -n "${GH_DEBUG+x}" || -n "${GH_CONFIG_DIR+x}" ||
  -n "${HTTPS_PROXY+x}" || -n "${https_proxy+x}" ||
  -n "${ALL_PROXY+x}" || -n "${all_proxy+x}" ||
  -n "${SSL_CERT_FILE+x}" || -n "${SSL_CERT_DIR+x}" ||
  -n "${CURL_CA_BUNDLE+x}" ]]; then
  printf 'gh inherited unsafe host, debug, proxy, or trust configuration\n' >&2
  exit 1
fi
printf 'gh %s\n' "$*" >>"${CALL_LOG}"
if [[ "$*" == *"repos/Kloudedge-apex/Workforce-OS/git/ref/heads/main"* &&
  "$*" == *"--jq .object.sha"* ]]; then
  if [[ "${FAKE_SWAP_HELPER_AFTER_ADMISSION:-false}" == "true" ]]; then
    mv "${PWD}/scripts/verify-github-console-release-ci.sh" \
      "${PWD}/scripts/verify-github-console-release-ci.reviewed"
    ln -s "${FAKE_ESCAPE_HELPER}" "${PWD}/scripts/verify-github-console-release-ci.sh"
  fi
  if [[ "${FAKE_BLOCK_REMOTE_CHECK:-false}" == "true" ]]; then
    printf '%s\n' "${CONSOLE_RELEASE_SNAPSHOT_PARENT_PID}" >"${FAKE_BOOTSTRAP_PID_FILE}"
    printf '%s\n' "${PPID}" >"${FAKE_CONTROLLER_PID_FILE}"
    printf '%s\n' "${BASHPID}" >"${FAKE_BLOCKER_PID_FILE}"
    printf '%s\n' "${PWD}" >"${FAKE_SNAPSHOT_ROOT_FILE}"
    : >"${FAKE_CONTROLLER_READY_FILE}"
    while kill -0 "${PPID}" 2>/dev/null; do
      sleep 0.01
    done
    exit 1
  fi
  printf '%s\n' "${FAKE_REMOTE_COMMIT}"
  exit 0
fi
exit 1
EOF

  cat >"${HARNESS}/bin/az" <<'EOF'
#!/usr/bin/env bash
printf 'az %s\n' "$*" >>"${CALL_LOG}"

argument() {
  local wanted=$1
  shift
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "${wanted}" ]]; then
      printf '%s\n' "${2:-}"
      return 0
    fi
    shift
  done
  return 1
}

if [[ "${1:-} ${2:-}" == "containerapp show" ]]; then
  printf 'show\n' >>"${SHOW_LOG}"
  show_count="$(wc -l <"${SHOW_LOG}" | tr -d ' ')"
  current="$(tail -n 1 "${UPDATE_LOG}" 2>/dev/null)"
  if [[ -n "${current}" ]]; then
    printf '%s\n' "${current}"
  elif [[ "${FAKE_CONCURRENT_SHOW_AT:-0}" =~ ^[1-9][0-9]*$ &&
    "${show_count}" -ge "${FAKE_CONCURRENT_SHOW_AT}" ]]; then
    printf '%s\n' "${FAKE_CONCURRENT_IMAGE}"
  else
    printf '%s\n' "${FAKE_PREVIOUS_IMAGE}"
  fi
  exit 0
fi
if [[ "${1:-} ${2:-}" == "containerapp update" ]]; then
  image="$(argument --image "$@")"
  printf '%s\n' "${image}" >>"${UPDATE_LOG}"
  if [[ "${image}" == "${FAKE_PREVIOUS_IMAGE}" ]]; then
    exit "${FAKE_ROLLBACK_UPDATE_STATUS:-0}"
  fi
  exit "${FAKE_UPDATE_STATUS:-0}"
fi
if [[ "${1:-} ${2:-}" == "acr build" ]]; then
  printf '%s\n' "${FAKE_RUN_ID}"
  exit 0
fi
if [[ "${1:-} ${2:-} ${3:-}" == "acr task show-run" ]]; then
  query="$(argument --query "$@")"
  if [[ "${query}" == "status" ]]; then
    printf '%s\n' "Succeeded"
  else
    printf '%s\n' "${FAKE_DIGEST}"
  fi
  exit 0
fi
exit 1
EOF

  chmod +x "${HARNESS}/bin/git" "${HARNESS}/bin/docker" "${HARNESS}/bin/gh" "${HARNESS}/bin/az" \
    "${HARNESS}/repo/scripts/deploy-console-prod.sh" \
    "${HARNESS}/repo/scripts/verify-github-console-release-ci.sh" \
    "${HARNESS}/repo/scripts/verify-console-image.sh" \
    "${HARNESS}/repo/scripts/verify-registry-console-image.sh" \
    "${HARNESS}/repo/scripts/verify-console-containerapp-config.sh"
  CALL_LOG="${HARNESS}/calls.log"
  UPDATE_LOG="${HARNESS}/updates.log"
  SHOW_LOG="${HARNESS}/shows.log"
  mkdir -p "${HARNESS}/repo/docs/ops" "${HARNESS}/repo-git-common/objects"
  printf '%s\n' d0aff3861e7d1ae6baf25cd8bc5f10c9e9b0162b577d5d41eeeb93cb70eb524a \
    >"${HARNESS}/repo/docs/ops/production-clerk-publishable-key.sha256"
  printf '%s\n' f6c46487188a7edd8c8d86cac11db16775ce7b2718875ce0b056b77ca614055d \
    >"${HARNESS}/repo/docs/ops/production-api-upstream-url.sha256"
  printf '%s\n' 5eddc3f498e16df540776fa025bef86f741fae6815abfb9dd80652026b8956ad \
    >"${HARNESS}/repo/docs/ops/production-clerk-auth.sha256"
  : >"${CALL_LOG}"
  : >"${UPDATE_LOG}"
  : >"${SHOW_LOG}"
}

run_fake_deploy() {
  local -a extra_environment=("PATH=${HARNESS}/bin:${PATH}")
  if [[ -n "${FAKE_EXPORTED_ENV_MARKER:-}" ]]; then
    extra_environment+=(
      'BASH_FUNC_/usr/bin/env%%=() {  printf "mutable-exported-env-function-ran\n" >>"${FAKE_EXPORTED_ENV_MARKER}"; return 96; }'
    )
  fi
  env "${extra_environment[@]}" \
    CALL_LOG="${CALL_LOG}" \
    UPDATE_LOG="${UPDATE_LOG}" \
    SHOW_LOG="${SHOW_LOG}" \
    TMPDIR="${HARNESS}/tmp" \
    FAKE_REPO_ROOT="${HARNESS}/repo" \
    FAKE_BRANCH="${FAKE_BRANCH}" \
    FAKE_COMMIT="${FAKE_COMMIT}" \
    FAKE_REMOTE_COMMIT="${FAKE_REMOTE_COMMIT}" \
    FAKE_PREVIOUS_IMAGE="${FAKE_PREVIOUS_IMAGE}" \
    FAKE_RUN_ID="${FAKE_RUN_ID}" \
    FAKE_DIGEST="${FAKE_DIGEST}" \
    FAKE_TREE_SHA="${FAKE_TREE_SHA}" \
    FAKE_LEASE_COMMIT="${FAKE_LEASE_COMMIT}" \
    FAKE_NEW_IMAGE="${FAKE_NEW_IMAGE:-}" \
    FAKE_CI_STATUS="${FAKE_CI_STATUS:-0}" \
    FAKE_REGISTRY_STATUS="${FAKE_REGISTRY_STATUS:-0}" \
    FAKE_LOCK_STATUS="${FAKE_LOCK_STATUS:-0}" \
    FAKE_LEASE_CLEANUP_STATUS="${FAKE_LEASE_CLEANUP_STATUS:-0}" \
    FAKE_CONFIG_STATUS="${FAKE_CONFIG_STATUS:-0}" \
    FAKE_NEW_CONFIG_STATUS="${FAKE_NEW_CONFIG_STATUS:-0}" \
    FAKE_DIRTY_STATUS="${FAKE_DIRTY_STATUS:-0}" \
    FAKE_UPDATE_STATUS="${FAKE_UPDATE_STATUS:-0}" \
    FAKE_ROLLBACK_UPDATE_STATUS="${FAKE_ROLLBACK_UPDATE_STATUS:-0}" \
    FAKE_CONCURRENT_SHOW_AT="${FAKE_CONCURRENT_SHOW_AT:-0}" \
    FAKE_CONCURRENT_IMAGE="${FAKE_CONCURRENT_IMAGE:-}" \
    FAKE_MUTATE_AFTER_ARCHIVE="${FAKE_MUTATE_AFTER_ARCHIVE:-false}" \
    FAKE_BLOCK_REMOTE_CHECK="${FAKE_BLOCK_REMOTE_CHECK:-false}" \
    FAKE_SWAP_HELPER_AFTER_ADMISSION="${FAKE_SWAP_HELPER_AFTER_ADMISSION:-false}" \
    FAKE_ESCAPE_HELPER="${FAKE_ESCAPE_HELPER:-}" \
    FAKE_BOOTSTRAP_PID_FILE="${FAKE_BOOTSTRAP_PID_FILE:-}" \
    FAKE_CONTROLLER_PID_FILE="${FAKE_CONTROLLER_PID_FILE:-}" \
    FAKE_BLOCKER_PID_FILE="${FAKE_BLOCKER_PID_FILE:-}" \
    FAKE_SNAPSHOT_ROOT_FILE="${FAKE_SNAPSHOT_ROOT_FILE:-}" \
    FAKE_CONTROLLER_READY_FILE="${FAKE_CONTROLLER_READY_FILE:-}" \
    VITE_CLERK_PUBLISHABLE_KEY="pk_test_c2FmZS10ZXN0LW9ubHkk" \
    ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED="${FAKE_AUTHORITY_CONFIRMED:-true}" \
    CONSOLE_RELEASE_VERIFY_ATTEMPTS=1 \
    CONSOLE_RELEASE_VERIFY_DELAY_SECONDS=0 \
    "${HARNESS}/repo/scripts/deploy-console-prod.sh" --yes
}

reset_deploy_harness() {
  : >"${CALL_LOG}"
  : >"${UPDATE_LOG}"
  : >"${SHOW_LOG}"
  FAKE_BRANCH="main"
  FAKE_REMOTE_COMMIT="${FAKE_COMMIT}"
  FAKE_PREVIOUS_IMAGE="ledgracr.azurecr.io/workforceos-fe@sha256:$(printf '1%.0s' {1..64})"
  FAKE_CI_STATUS=0
  FAKE_REGISTRY_STATUS=0
  FAKE_CONFIG_STATUS=0
  FAKE_NEW_CONFIG_STATUS=0
  FAKE_DIRTY_STATUS=0
  FAKE_UPDATE_STATUS=0
  FAKE_ROLLBACK_UPDATE_STATUS=0
  FAKE_LOCK_STATUS=0
  FAKE_LEASE_CLEANUP_STATUS=0
  FAKE_CONCURRENT_SHOW_AT=0
  FAKE_CONCURRENT_IMAGE=""
  FAKE_MUTATE_AFTER_ARCHIVE=false
  FAKE_BLOCK_REMOTE_CHECK=false
  FAKE_SWAP_HELPER_AFTER_ADMISSION=false
  FAKE_ESCAPE_HELPER=""
  FAKE_BOOTSTRAP_PID_FILE=""
  FAKE_CONTROLLER_PID_FILE=""
  FAKE_BLOCKER_PID_FILE=""
  FAKE_SNAPSHOT_ROOT_FILE=""
  FAKE_CONTROLLER_READY_FILE=""
  FAKE_AUTHORITY_CONFIRMED=true
}

test_deploy_guard() {
  local expected_image
  make_deploy_harness
  FAKE_COMMIT="$(printf '2%.0s' {1..40})"
  FAKE_RUN_ID="ca123"
  FAKE_DIGEST="sha256:$(printf '3%.0s' {1..64})"
  FAKE_TREE_SHA="$(printf '5%.0s' {1..40})"
  FAKE_LEASE_COMMIT="$(printf '6%.0s' {1..40})"
  expected_image="ledgracr.azurecr.io/workforceos-fe@${FAKE_DIGEST}"
  FAKE_NEW_IMAGE="${expected_image}"
  reset_deploy_harness

  run_fake_deploy >/dev/null
  assert_contains "${CALL_LOG}" "verify-ci ${FAKE_COMMIT}"
  assert_contains "${CALL_LOG}" "archive --format=tar ${FAKE_COMMIT}"
  assert_before "${CALL_LOG}" "archive --format=tar ${FAKE_COMMIT}" "verify-ci ${FAKE_COMMIT}"
  assert_contains "${CALL_LOG}" "--secret-build-arg VITE_CLERK_PUBLISHABLE_KEY="
  assert_contains "${CALL_LOG}" "--build-arg VITE_CLERK_PUBLISHABLE_KEY_SHA256=d0aff3861e7d1ae6baf25cd8bc5f10c9e9b0162b577d5d41eeeb93cb70eb524a"
  assert_contains "${CALL_LOG}" "verify-registry ${expected_image} ${FAKE_COMMIT} d0aff3861e7d1ae6baf25cd8bc5f10c9e9b0162b577d5d41eeeb93cb70eb524a"
  assert_contains "${CALL_LOG}" "init --quiet --bare --template="
  assert_contains "${CALL_LOG}" "push --porcelain --force-with-lease=refs/heads/workforce-os-release-lock/production-console: origin ${FAKE_LEASE_COMMIT}:refs/heads/workforce-os-release-lock/production-console"
  assert_contains "${CALL_LOG}" "push --porcelain --force-with-lease=refs/heads/workforce-os-release-lock/production-console:${FAKE_LEASE_COMMIT} origin :refs/heads/workforce-os-release-lock/production-console"
  assert_before "${CALL_LOG}" "force-with-lease=refs/heads/workforce-os-release-lock/production-console: origin ${FAKE_LEASE_COMMIT}" "az containerapp show"
  assert_excludes "${CALL_LOG}" "gh api --method DELETE"
  assert_contains "${CALL_LOG}" "az containerapp update --name nikxius-web"
  assert_before "${CALL_LOG}" "verify-registry" "az containerapp update"
  [[ "$(tail -n 1 "${UPDATE_LOG}")" == "${expected_image}" ]] || fail "deploy did not select exact digest"
  pass

  reset_deploy_harness
  FAKE_LEASE_CLEANUP_STATUS=1
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy reported clean success after conditional lease cleanup failed"
  fi
  [[ "$(tail -n 1 "${UPDATE_LOG}")" == "${expected_image}" ]] ||
    fail "cleanup-failure case did not first complete the rollout"
  assert_contains "${CALL_LOG}" "force-with-lease=refs/heads/workforce-os-release-lock/production-console:${FAKE_LEASE_COMMIT} origin :refs/heads/workforce-os-release-lock/production-console"
  pass

  reset_deploy_harness
  FAKE_LOCK_STATUS=1
  if run_fake_deploy >/dev/null 2>&1; then
    fail "console deploy continued without acquiring the production release lease"
  fi
  assert_excludes "${CALL_LOG}" "az containerapp show"
  assert_excludes "${CALL_LOG}" "az acr build"
  pass

  reset_deploy_harness
  FAKE_REMOTE_COMMIT="$(printf '4%.0s' {1..40})"
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy accepted an unpublished commit"
  fi
  assert_excludes "${CALL_LOG}" "az acr build"
  pass

  reset_deploy_harness
  FAKE_BRANCH="feature/not-main"
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy accepted a non-main branch"
  fi
  assert_excludes "${CALL_LOG}" "verify-ci"
  pass

  reset_deploy_harness
  FAKE_PREVIOUS_IMAGE="ledgracr.azurecr.io/workforceos-fe:legacy"
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy accepted a mutable rollback image"
  fi
  assert_excludes "${CALL_LOG}" "az acr build"
  pass

  reset_deploy_harness
  FAKE_REGISTRY_STATUS=1
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy continued after registry verification failed"
  fi
  assert_excludes "${CALL_LOG}" "az containerapp update"
  pass

  reset_deploy_harness
  FAKE_AUTHORITY_CONFIRMED=false
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy wrote the Container App without exclusive-authority attestation"
  fi
  assert_excludes "${CALL_LOG}" "az containerapp update"
  assert_excludes "${CALL_LOG}" "force-with-lease=refs/heads/workforce-os-release-lock/production-console: origin"
  assert_excludes "${CALL_LOG}" "az acr build"
  pass

  reset_deploy_harness
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'printf "escaped-helper-ran\n" >>"${CALL_LOG}"' \
    'exit 0' >"${HARNESS}/escaped-helper.sh"
  chmod +x "${HARNESS}/escaped-helper.sh"
  FAKE_SWAP_HELPER_AFTER_ADMISSION=true
  FAKE_ESCAPE_HELPER="${HARNESS}/escaped-helper.sh"
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy accepted a helper symlink swapped after initial snapshot admission"
  fi
  assert_excludes "${CALL_LOG}" "escaped-helper-ran"
  assert_excludes "${CALL_LOG}" "az acr build"
  assert_excludes "${CALL_LOG}" \
    "force-with-lease=refs/heads/workforce-os-release-lock/production-console: origin"
  pass

  reset_deploy_harness
  FAKE_CONCURRENT_SHOW_AT=3
  FAKE_CONCURRENT_IMAGE="ledgracr.azurecr.io/workforceos-fe@sha256:$(printf '7%.0s' {1..64})"
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy overwrote an image changed at the final pre-write read"
  fi
  assert_excludes "${CALL_LOG}" "az containerapp update"
  assert_contains "${CALL_LOG}" "force-with-lease=refs/heads/workforce-os-release-lock/production-console:${FAKE_LEASE_COMMIT} origin :refs/heads/workforce-os-release-lock/production-console"
  pass

  reset_deploy_harness
  FAKE_NEW_CONFIG_STATUS=1
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy reported success after new revision verification failed"
  fi
  [[ "$(sed -n '1p' "${UPDATE_LOG}")" == "${expected_image}" ]] || fail "new image was not attempted"
  [[ "$(sed -n '2p' "${UPDATE_LOG}")" == "${FAKE_PREVIOUS_IMAGE}" ]] || fail "previous digest was not restored"
  assert_excludes "${CALL_LOG}" "force-with-lease=refs/heads/workforce-os-release-lock/production-console:${FAKE_LEASE_COMMIT} origin :refs/heads/workforce-os-release-lock/production-console"
  pass

  reset_deploy_harness
  FAKE_NEW_CONFIG_STATUS=1
  FAKE_ROLLBACK_UPDATE_STATUS=1
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy reported success after rollback failed"
  fi
  assert_contains "${CALL_LOG}" "force-with-lease=refs/heads/workforce-os-release-lock/production-console: origin ${FAKE_LEASE_COMMIT}:refs/heads/workforce-os-release-lock/production-console"
  assert_excludes "${CALL_LOG}" "force-with-lease=refs/heads/workforce-os-release-lock/production-console:${FAKE_LEASE_COMMIT} origin :refs/heads/workforce-os-release-lock/production-console"
  pass
}

test_exact_commit_controller_boundary() {
  local build_context expected_image
  make_deploy_harness
  FAKE_COMMIT="$(printf '8%.0s' {1..40})"
  FAKE_RUN_ID="ca456"
  FAKE_DIGEST="sha256:$(printf '9%.0s' {1..64})"
  FAKE_TREE_SHA="$(printf 'a%.0s' {1..40})"
  FAKE_LEASE_COMMIT="$(printf 'b%.0s' {1..40})"
  expected_image="ledgracr.azurecr.io/workforceos-fe@${FAKE_DIGEST}"
  FAKE_NEW_IMAGE="${expected_image}"
  reset_deploy_harness

  printf '%s\n' \
    'if [[ "${CONSOLE_RELEASE_STAGE:-}" == "exact-commit-controller" ]]; then' \
    '  printf "mutable-shell-startup-ran\n" >>"${FAKE_SHELL_STARTUP_MARKER}"' \
    'fi' >"${HARNESS}/hostile-shell-startup"
  (
    command() {
      printf 'mutable-exported-command-function-ran\n' >>"${FAKE_EXPORTED_COMMAND_MARKER}"
      return 99
    }
    gh() {
      printf 'mutable-exported-function-ran\n' >>"${FAKE_EXPORTED_FUNCTION_MARKER}"
      return 97
    }
    git() {
      printf 'mutable-exported-git-function-ran\n' >>"${FAKE_EXPORTED_GIT_MARKER}"
      return 98
    }
    export -f command gh git
    export BASH_ENV="${HARNESS}/hostile-shell-startup"
    export ENV="${HARNESS}/hostile-shell-startup"
    export FAKE_EXPORTED_COMMAND_MARKER="${HARNESS}/exported-command-marker"
    export FAKE_EXPORTED_ENV_MARKER="${HARNESS}/exported-env-marker"
    export FAKE_EXPORTED_FUNCTION_MARKER="${HARNESS}/exported-function-marker"
    export FAKE_EXPORTED_GIT_MARKER="${HARNESS}/exported-git-marker"
    export FAKE_SHELL_STARTUP_MARKER="${HARNESS}/shell-startup-marker"
    run_fake_deploy >/dev/null
  )
  [[ ! -e "${HARNESS}/shell-startup-marker" ]] ||
    fail "snapshot controller or helper evaluated caller-supplied shell startup code"
  [[ ! -e "${HARNESS}/exported-command-marker" ]] ||
    fail "bootstrap command dispatch was intercepted by an exported function"
  [[ ! -e "${HARNESS}/exported-env-marker" ]] ||
    fail "bootstrap absolute env invocation was intercepted by an exported function"
  pass
  [[ ! -e "${HARNESS}/exported-function-marker" ]] ||
    fail "snapshot controller imported a caller-supplied exported shell function"
  [[ ! -e "${HARNESS}/exported-git-marker" ]] ||
    fail "bootstrap Git was intercepted by a caller-supplied exported function"
  pass

  reset_deploy_harness
  FAKE_MUTATE_AFTER_ARCHIVE=true

  run_fake_deploy >/dev/null
  assert_contains "${CALL_LOG}" "verify-ci ${FAKE_COMMIT}"
  assert_excludes "${CALL_LOG}" "mutable-helper-ran"
  [[ "$(tail -n 1 "${UPDATE_LOG}")" == "${expected_image}" ]] ||
    fail "exact-commit controller did not complete after mutable helper drift"
  build_context="$(awk '/^az acr build / { print $NF; exit }' "${CALL_LOG}")"
  [[ "$(basename "${build_context}")" == workforce-os-console-release.* ]] ||
    fail "ACR build did not use the private exact-commit snapshot"
  [[ ! -e "${build_context}" ]] ||
    fail "bootstrap parent did not remove its exact private snapshot"
  pass
}

test_bootstrap_signal_forwarding() {
  local blocker_pid bootstrap_pid controller_pgid controller_pid runner_pid snapshot_root status
  local attempt

  make_deploy_harness
  FAKE_COMMIT="$(printf 'd%.0s' {1..40})"
  FAKE_RUN_ID="ca789"
  FAKE_DIGEST="sha256:$(printf 'e%.0s' {1..64})"
  FAKE_TREE_SHA="$(printf 'f%.0s' {1..40})"
  FAKE_LEASE_COMMIT="$(printf '1%.0s' {1..40})"
  FAKE_NEW_IMAGE="ledgracr.azurecr.io/workforceos-fe@${FAKE_DIGEST}"
  reset_deploy_harness
  FAKE_BLOCK_REMOTE_CHECK=true
  FAKE_BOOTSTRAP_PID_FILE="${HARNESS}/bootstrap.pid"
  FAKE_CONTROLLER_PID_FILE="${HARNESS}/controller.pid"
  FAKE_BLOCKER_PID_FILE="${HARNESS}/blocker.pid"
  FAKE_SNAPSHOT_ROOT_FILE="${HARNESS}/snapshot-root"
  FAKE_CONTROLLER_READY_FILE="${HARNESS}/controller-ready"

  run_fake_deploy >"${HARNESS}/signal.stdout" 2>"${HARNESS}/signal.stderr" &
  runner_pid=$!
  for attempt in {1..1000}; do
    if [[ -s "${FAKE_BOOTSTRAP_PID_FILE}" &&
      -s "${FAKE_CONTROLLER_PID_FILE}" &&
      -s "${FAKE_BLOCKER_PID_FILE}" &&
      -s "${FAKE_SNAPSHOT_ROOT_FILE}" &&
      -e "${FAKE_CONTROLLER_READY_FILE}" ]]; then
      break
    fi
    if ! kill -0 "${runner_pid}" 2>/dev/null; then
      wait "${runner_pid}" || true
      fail "bootstrap exited before the signal-forwarding fixture became ready"
    fi
    sleep 0.01
  done
  [[ -e "${FAKE_CONTROLLER_READY_FILE}" ]] ||
    fail "timed out waiting for the snapshot controller signal fixture"

  bootstrap_pid="$(<"${FAKE_BOOTSTRAP_PID_FILE}")"
  controller_pid="$(<"${FAKE_CONTROLLER_PID_FILE}")"
  blocker_pid="$(<"${FAKE_BLOCKER_PID_FILE}")"
  snapshot_root="$(<"${FAKE_SNAPSHOT_ROOT_FILE}")"
  [[ "${bootstrap_pid}" =~ ^[1-9][0-9]*$ && "${controller_pid}" =~ ^[1-9][0-9]*$ &&
    "${blocker_pid}" =~ ^[1-9][0-9]*$ ]] ||
    fail "signal fixture did not capture valid bootstrap/controller PIDs"
  [[ "${bootstrap_pid}" != "${controller_pid}" ]] ||
    fail "bootstrap did not launch a separately supervised controller"
  [[ -d "${snapshot_root}" ]] || fail "signal fixture did not capture the private snapshot"
  controller_pgid="$(ps -o pgid= -p "${controller_pid}" | tr -d ' ')"
  [[ "${controller_pgid}" == "${controller_pid}" &&
    "$(ps -o pgid= -p "${blocker_pid}" | tr -d ' ')" == "${controller_pgid}" ]] ||
    fail "snapshot controller and descendant did not run in one isolated process group"

  kill -TERM "${bootstrap_pid}"
  set +e
  wait "${runner_pid}"
  status=$?
  set -e

  [[ "${status}" -eq 143 ]] ||
    fail "bootstrap did not preserve TERM exit status (received ${status})"
  if kill -0 "${controller_pid}" 2>/dev/null; then
    fail "snapshot controller remained alive after TERM reached the bootstrap"
  fi
  if kill -0 "${blocker_pid}" 2>/dev/null; then
    fail "snapshot controller descendant remained alive after process-group TERM"
  fi
  if kill -0 -- "-${controller_pgid}" 2>/dev/null; then
    fail "snapshot controller process group remained alive after bootstrap exit"
  fi
  [[ ! -e "${snapshot_root}" ]] ||
    fail "bootstrap did not remove the terminated controller's private snapshot"
  if compgen -G "${HARNESS}/tmp/workforce-os-console-*" >/dev/null; then
    fail "bootstrap signal cleanup left snapshot, token, archive, or lease state"
  fi
  assert_excludes "${CALL_LOG}" "az acr build"
  assert_excludes "${CALL_LOG}" "az containerapp update"
  assert_excludes "${CALL_LOG}" "force-with-lease=refs/heads/workforce-os-release-lock/production-console: origin"
  pass
}

test_real_git_environment_isolation() {
  local attacker_url canonical_url harness isolated_url raw_url state_dir
  local isolated_definition

  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  state_dir="${harness}/state"
  mkdir -p "${state_dir}" "${harness}/attacker"
  git -C "${state_dir}" init -q
  canonical_url="https://github.com/Kloudedge-apex/Workforce-OS.git"
  attacker_url="file://${harness}/attacker/"
  git -C "${state_dir}" remote add origin "${canonical_url}"

  raw_url="$(env \
    GIT_CONFIG_COUNT=1 \
    GIT_CONFIG_KEY_0="url.${attacker_url}.insteadOf" \
    GIT_CONFIG_VALUE_0="https://github.com/" \
    git -C "${state_dir}" remote get-url origin)"
  [[ "${raw_url}" == "${attacker_url}Kloudedge-apex/Workforce-OS.git" ]] ||
    fail "real Git hostile insteadOf fixture did not rewrite the control URL"

  isolated_definition="$(awk '
    /^isolated_release_git\(\) \($/ { capture = 1 }
    capture { print }
    capture && /^\)$/ { exit }
  ' "${REPO_ROOT}/scripts/deploy-console-prod.sh")"
  eval "${isolated_definition}"
  RELEASE_GIT_BIN="$(type -P git)"
  isolated_url="$(
    export GIT_CONFIG_COUNT=1
    export GIT_CONFIG_KEY_0="url.${attacker_url}.insteadOf"
    export GIT_CONFIG_VALUE_0="https://github.com/"
    export GIT_CONFIG_PARAMETERS="malformed-hostile-legacy-config"
    export GIT_ATTR_SOURCE="$(printf 'a%.0s' {1..40})"
    export GIT_COMMON_DIR="${harness}/attacker"
    export GIT_EXEC_PATH="${harness}/attacker"
    export GIT_OBJECT_DIRECTORY="${harness}/attacker"
    isolated_release_git -C "${state_dir}" remote get-url origin
  )"
  [[ "${isolated_url}" == "${canonical_url}" ]] ||
    fail "isolated release Git allowed inherited config to rewrite the canonical URL"
  pass
}

test_real_git_lease_cas_lifecycle() {
  local commit harness isolated_definition lease_git_dir lease_one lease_two
  local lock_ref remote seed tree

  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  seed="${harness}/seed"
  remote="${harness}/remote.git"
  lease_git_dir="${harness}/lease.git"
  lock_ref="refs/heads/workforce-os-release-lock/production-console"
  mkdir -p "${seed}"
  git -C "${seed}" init -q
  git -C "${seed}" checkout -q -b main
  git -C "${seed}" config user.name "Release Test"
  git -C "${seed}" config user.email "release-test@example.invalid"
  printf '%s\n' 'lease fixture' >"${seed}/fixture.txt"
  git -C "${seed}" add fixture.txt
  git -C "${seed}" commit -q -m "fixture: lease base"
  commit="$(git -C "${seed}" rev-parse HEAD)"
  git clone -q --bare "${seed}" "${remote}"

  isolated_definition="$(awk '
    /^isolated_release_git\(\) \($/ { capture = 1 }
    capture { print }
    capture && /^\)$/ { exit }
  ' "${REPO_ROOT}/scripts/deploy-console-prod.sh")"
  eval "${isolated_definition}"
  RELEASE_GIT_BIN="$(type -P git)"
  isolated_release_git init --quiet --bare "${lease_git_dir}"
  isolated_release_git --git-dir="${lease_git_dir}" remote add origin "${remote}"
  isolated_release_git --git-dir="${lease_git_dir}" \
    fetch --quiet --no-tags --depth=1 origin refs/heads/main
  tree="$(isolated_release_git --git-dir="${lease_git_dir}" rev-parse FETCH_HEAD^{tree})"
  lease_one="$(printf '%s\n' 'lease one' | isolated_release_git \
    -c user.name='Release Test' -c user.email=release-test@example.invalid \
    --git-dir="${lease_git_dir}" commit-tree "${tree}" -p "${commit}")"
  lease_two="$(printf '%s\n' 'lease two' | isolated_release_git \
    -c user.name='Release Test' -c user.email=release-test@example.invalid \
    --git-dir="${lease_git_dir}" commit-tree "${tree}" -p "${lease_one}")"

  isolated_release_git --git-dir="${lease_git_dir}" push --quiet \
    --force-with-lease="${lock_ref}:" origin "${lease_one}:${lock_ref}"
  if isolated_release_git --git-dir="${lease_git_dir}" push --quiet \
    --force-with-lease="${lock_ref}:" origin "${lease_two}:${lock_ref}" 2>/dev/null; then
    fail "real Git empty-expected lease allowed a second descendant acquisition"
  fi
  if isolated_release_git --git-dir="${lease_git_dir}" push --quiet \
    --force-with-lease="${lock_ref}:${lease_two}" origin ":${lock_ref}" 2>/dev/null; then
    fail "real Git lease cleanup accepted the wrong unique attempt identity"
  fi
  isolated_release_git --git-dir="${lease_git_dir}" push --quiet \
    --force-with-lease="${lock_ref}:${lease_one}" origin ":${lock_ref}"
  if git --git-dir="${remote}" show-ref --verify --quiet "${lock_ref}"; then
    fail "real Git lease ref remained after matching conditional cleanup"
  fi
  pass
}

test_archive_ignores_uncommitted_attributes() {
  local harness repo status tmp

  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  repo="${harness}/repo"
  tmp="${harness}/tmp"
  mkdir -p "${repo}/scripts" "${repo}/docs/ops" "${tmp}"
  cp "${REPO_ROOT}/scripts/deploy-console-prod.sh" \
    "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
    "${REPO_ROOT}/scripts/verify-console-image.sh" \
    "${REPO_ROOT}/scripts/verify-github-console-release-ci.sh" \
    "${REPO_ROOT}/scripts/verify-registry-console-image.sh" \
    "${repo}/scripts/"
  cp "${REPO_ROOT}/Dockerfile" "${repo}/"
  printf '%s\n' "$(printf 'a%.0s' {1..64})" \
    >"${repo}/docs/ops/production-api-upstream-url.sha256"
  printf '%s\n' "$(printf 'c%.0s' {1..64})" \
    >"${repo}/docs/ops/production-clerk-auth.sha256"
  printf '%s\n' "$(printf 'b%.0s' {1..64})" \
    >"${repo}/docs/ops/production-clerk-publishable-key.sha256"
  printf '%s\n' 'archive-decoy.txt export-ignore' >"${repo}/.gitattributes"
  printf '%s\n' 'committed attribute fixture' >"${repo}/archive-decoy.txt"
  chmod +x "${repo}/scripts/"*.sh
  git -C "${repo}" init -q
  git -C "${repo}" checkout -q -b main
  git -C "${repo}" config user.name "Release Test"
  git -C "${repo}" config user.email "release-test@example.invalid"
  git -C "${repo}" add .
  git -C "${repo}" commit -q -m "fixture: exact release tree"

  printf '%s\n' 'scripts/deploy-console-prod.sh export-ignore' \
    >"${repo}/.git/info/attributes"
  printf '%s\n' 'scripts/verify-github-console-release-ci.sh export-ignore' \
    >"${harness}/global-attributes"
  printf '[core]\n\tattributesFile = %s\n' "${harness}/global-attributes" \
    >"${harness}/hostile.gitconfig"

  set +e
  env \
    GIT_CONFIG_GLOBAL="${harness}/hostile.gitconfig" \
    TAR_OPTIONS='--exclude=scripts/deploy-console-prod.sh' \
    TMPDIR="${tmp}" \
    VITE_CLERK_PUBLISHABLE_KEY=pk_test_c2FmZS10ZXN0LW9ubHkk \
    ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=false \
    "${repo}/scripts/deploy-console-prod.sh" --yes \
    >"${harness}/archive.stdout" 2>"${harness}/archive.stderr"
  status=$?
  set -e
  [[ "${status}" -ne 0 ]] || fail "hostile-attributes release fixture unexpectedly deployed"
  if ! grep -Fq "ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=true is required" \
    "${harness}/archive.stderr"; then
    sed -n '1,80p' "${harness}/archive.stderr" >&2
    fail "hostile-attributes fixture did not reach exact snapshot authority admission"
  fi
  assert_excludes "${harness}/archive.stderr" "exact-commit release controller is missing or unsafe"
  assert_excludes "${harness}/archive.stderr" "private snapshot release file is missing or unsafe"
  if compgen -G "${tmp}/workforce-os-console-*" >/dev/null; then
    fail "bootstrap left private archive, token, or snapshot state after admission failure"
  fi
  pass
}

test_snapshot_pin_component_symlink_rejected() {
  local commit harness snapshot_root token

  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  snapshot_root="${harness}/workforce-os-console-release.symlink"
  mkdir -p "${snapshot_root}/scripts" "${snapshot_root}/docs" "${harness}/outside-ops"
  snapshot_root="$(cd "${snapshot_root}" && pwd -P)"
  cp "${REPO_ROOT}/scripts/deploy-console-prod.sh" \
    "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
    "${REPO_ROOT}/scripts/verify-console-image.sh" \
    "${REPO_ROOT}/scripts/verify-github-console-release-ci.sh" \
    "${REPO_ROOT}/scripts/verify-registry-console-image.sh" \
    "${snapshot_root}/scripts/"
  cp "${REPO_ROOT}/Dockerfile" "${snapshot_root}/"
  chmod +x "${snapshot_root}/scripts/"*.sh
  printf '%s\n' "$(printf 'c%.0s' {1..64})" \
    >"${harness}/outside-ops/production-api-upstream-url.sha256"
  printf '%s\n' "$(printf 'f%.0s' {1..64})" \
    >"${harness}/outside-ops/production-clerk-auth.sha256"
  printf '%s\n' "$(printf 'd%.0s' {1..64})" \
    >"${harness}/outside-ops/production-clerk-publishable-key.sha256"
  ln -s "${harness}/outside-ops" "${snapshot_root}/docs/ops"
  token="$(printf 'e%.0s' {1..64})"
  printf '%s\n' "${token}" >"${harness}/token"
  commit="$(printf 'f%.0s' {1..40})"

  if env \
    CONSOLE_RELEASE_STAGE=exact-commit-controller \
    CONSOLE_RELEASE_SNAPSHOT_ROOT="${snapshot_root}" \
    CONSOLE_RELEASE_COMMIT="${commit}" \
    CONSOLE_RELEASE_BRANCH=main \
    CONSOLE_RELEASE_SNAPSHOT_PARENT_PID="$$" \
    CONSOLE_RELEASE_SNAPSHOT_TOKEN="${token}" \
    CONSOLE_RELEASE_SNAPSHOT_TOKEN_FILE="${harness}/token" \
    VITE_CLERK_PUBLISHABLE_KEY=pk_test_c2FmZS10ZXN0LW9ubHkk \
    ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=false \
    "${snapshot_root}/scripts/deploy-console-prod.sh" --yes \
    >"${harness}/symlink.stdout" 2>"${harness}/symlink.stderr"; then
    fail "snapshot controller accepted a pin path with an escaping symlink component"
  fi
  assert_contains "${harness}/symlink.stderr" \
    "private snapshot release file is missing or unsafe: docs/ops/production-api-upstream-url.sha256"
  assert_excludes "${harness}/symlink.stderr" \
    "ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=true is required"
  [[ -d "${snapshot_root}" ]] || fail "snapshot child deleted the symlink fixture root"
  pass
}

test_snapshot_clerk_auth_pin_symlink_rejected() {
  local commit harness snapshot_root token

  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  snapshot_root="${harness}/workforce-os-console-release.clerk-pin-symlink"
  mkdir -p "${snapshot_root}/scripts" "${snapshot_root}/docs/ops" "${harness}/outside-ops"
  snapshot_root="$(cd "${snapshot_root}" && pwd -P)"
  cp "${REPO_ROOT}/scripts/deploy-console-prod.sh" \
    "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" \
    "${REPO_ROOT}/scripts/verify-console-image.sh" \
    "${REPO_ROOT}/scripts/verify-github-console-release-ci.sh" \
    "${REPO_ROOT}/scripts/verify-registry-console-image.sh" \
    "${snapshot_root}/scripts/"
  cp "${REPO_ROOT}/Dockerfile" "${snapshot_root}/"
  chmod +x "${snapshot_root}/scripts/"*.sh
  printf '%s\n' "$(printf 'a%.0s' {1..64})" \
    >"${snapshot_root}/docs/ops/production-api-upstream-url.sha256"
  printf '%s\n' "$(printf 'b%.0s' {1..64})" \
    >"${snapshot_root}/docs/ops/production-clerk-publishable-key.sha256"
  printf '%s\n' "$(printf 'c%.0s' {1..64})" \
    >"${harness}/outside-ops/production-clerk-auth.sha256"
  ln -s "${harness}/outside-ops/production-clerk-auth.sha256" \
    "${snapshot_root}/docs/ops/production-clerk-auth.sha256"
  token="$(printf 'd%.0s' {1..64})"
  printf '%s\n' "${token}" >"${harness}/token"
  commit="$(printf 'e%.0s' {1..40})"

  if env \
    CONSOLE_RELEASE_STAGE=exact-commit-controller \
    CONSOLE_RELEASE_SNAPSHOT_ROOT="${snapshot_root}" \
    CONSOLE_RELEASE_COMMIT="${commit}" \
    CONSOLE_RELEASE_BRANCH=main \
    CONSOLE_RELEASE_SNAPSHOT_PARENT_PID="$$" \
    CONSOLE_RELEASE_SNAPSHOT_TOKEN="${token}" \
    CONSOLE_RELEASE_SNAPSHOT_TOKEN_FILE="${harness}/token" \
    VITE_CLERK_PUBLISHABLE_KEY=pk_test_c2FmZS10ZXN0LW9ubHkk \
    ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=false \
    "${snapshot_root}/scripts/deploy-console-prod.sh" --yes \
    >"${harness}/symlink.stdout" 2>"${harness}/symlink.stderr"; then
    fail "snapshot controller accepted a symlinked Clerk auth pin"
  fi
  assert_contains "${harness}/symlink.stderr" \
    "private snapshot release file is missing or unsafe: docs/ops/production-clerk-auth.sha256"
  assert_excludes "${harness}/symlink.stderr" \
    "ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=true is required"
  [[ -d "${snapshot_root}" ]] || fail "snapshot child deleted the Clerk auth pin fixture root"
  pass
}

test_controller_never_deletes_supplied_snapshot_path() {
  local commit harness spoof_root
  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  spoof_root="${harness}/workforce-os-console-release.spoof"
  mkdir -p "${spoof_root}/scripts"
  cp "${REPO_ROOT}/scripts/deploy-console-prod.sh" "${spoof_root}/scripts/"
  chmod +x "${spoof_root}/scripts/deploy-console-prod.sh"
  spoof_root="$(cd "${spoof_root}" && pwd -P)"
  commit="$(printf 'c%.0s' {1..40})"

  if env \
    CONSOLE_RELEASE_STAGE=exact-commit-controller \
    CONSOLE_RELEASE_SNAPSHOT_ROOT="${spoof_root}" \
    CONSOLE_RELEASE_COMMIT="${commit}" \
    CONSOLE_RELEASE_BRANCH=main \
    VITE_CLERK_PUBLISHABLE_KEY=pk_test_c2FmZS10ZXN0LW9ubHkk \
    ACA_EXCLUSIVE_MUTATION_AUTHORITY_CONFIRMED=false \
    "${spoof_root}/scripts/deploy-console-prod.sh" --yes >/dev/null 2>&1; then
    fail "spoofed controller execution unexpectedly passed authority admission"
  fi
  [[ -d "${spoof_root}" ]] ||
    fail "controller recursively deleted an environment-supplied snapshot path"
  pass
}

test_source_contract
test_clerk_auth_pin_vector
test_production_release_workflow_verifier
test_registry_verifier
test_github_ci_verifier
test_containerapp_verifier
test_deploy_guard
test_exact_commit_controller_boundary
test_bootstrap_signal_forwarding
test_real_git_environment_isolation
test_real_git_lease_cas_lifecycle
test_archive_ignores_uncommitted_attributes
test_snapshot_pin_component_symlink_rejected
test_snapshot_clerk_auth_pin_symlink_rejected
test_controller_never_deletes_supplied_snapshot_path

echo "Console release script tests passed: ${TESTS_PASSED}"
