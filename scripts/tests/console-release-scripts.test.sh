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
  pass
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
            {name: "CLERK_AUTHORIZED_PARTIES", value: "https://workforceos.xyz,https://www.workforceos.xyz"}
          ],
          probes: [{type: "Liveness", httpGet: {path: "/api/healthz", port: 8080, scheme: "HTTP"}}]
        }]
      }
    }
  }' >"${target}"
}

test_containerapp_verifier() {
  local harness image commit
  harness="$(mktemp -d)"
  TEMP_DIRS+=("${harness}")
  mkdir -p "${harness}/bin" "${harness}/scripts"
  cp "${REPO_ROOT}/scripts/verify-console-containerapp-config.sh" "${harness}/scripts/"
  mkdir -p "${harness}/docs/ops"
  printf '%s\n' f6c46487188a7edd8c8d86cac11db16775ce7b2718875ce0b056b77ca614055d \
    >"${harness}/docs/ops/production-api-upstream-url.sha256"
  git -C "${harness}" init -q
  git -C "${harness}" config user.name "Release Test"
  git -C "${harness}" config user.email "release-test@example.invalid"
  git -C "${harness}" add docs/ops/production-api-upstream-url.sha256
  git -C "${harness}" commit -q -m "fixture: pin production API origin"
  commit="$(git -C "${harness}" rev-parse HEAD)"
  printf '%s\n' "$(printf 'a%.0s' {1..64})" \
    >"${harness}/docs/ops/production-api-upstream-url.sha256"
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

  jq '.properties.healthState = "Unhealthy"' \
    "${harness}/revision.json" >"${harness}/unhealthy-revision.json"
  if env PATH="${harness}/bin:${PATH}" APP_JSON_FILE="${harness}/app.json" \
    REVISION_JSON_FILE="${harness}/unhealthy-revision.json" \
    "${harness}/scripts/verify-console-containerapp-config.sh" \
    "${image}" "${commit}" >/dev/null 2>&1; then
    fail "Container App verifier accepted an unhealthy revision"
  fi
  pass
}

make_deploy_harness() {
  HARNESS="$(mktemp -d)"
  TEMP_DIRS+=("${HARNESS}")
  mkdir -p "${HARNESS}/bin" "${HARNESS}/repo/scripts"
  cp "${REPO_ROOT}/scripts/deploy-console-prod.sh" "${HARNESS}/repo/scripts/"

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
#!/usr/bin/env bash
printf 'git %s\n' "$*" >>"${CALL_LOG}"
if [[ "${1:-}" == "archive" && "${2:-}" == "--format=tar" ]]; then
  tar -cf - --files-from /dev/null
  exit 0
fi
if [[ "${1:-}" == "show" && \
  "${2:-}" == "${FAKE_COMMIT}:docs/ops/production-clerk-publishable-key.sha256" ]]; then
  printf '%s\n' d0aff3861e7d1ae6baf25cd8bc5f10c9e9b0162b577d5d41eeeb93cb70eb524a
  exit 0
fi
case "${1:-} ${2:-} ${3:-}" in
  "rev-parse --show-toplevel ") printf '%s\n' "${FAKE_REPO_ROOT}" ;;
  "rev-parse --abbrev-ref HEAD") printf '%s\n' "${FAKE_BRANCH}" ;;
  "rev-parse HEAD ") printf '%s\n' "${FAKE_COMMIT}" ;;
  "diff --quiet ") exit "${FAKE_DIRTY_STATUS:-0}" ;;
  "diff --cached --quiet") exit "${FAKE_DIRTY_STATUS:-0}" ;;
  "status --short --untracked-files=no") exit 0 ;;
  "ls-remote --exit-code origin") printf '%s\trefs/heads/main\n' "${FAKE_REMOTE_COMMIT}" ;;
  *) printf 'unexpected git invocation: %s\n' "$*" >&2; exit 1 ;;
esac
EOF

  cat >"${HARNESS}/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >>"${CALL_LOG}"
[[ "${1:-}" == "info" ]]
EOF

  cat >"${HARNESS}/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf 'gh %s\n' "$*" >>"${CALL_LOG}"
if [[ "$*" == *"--method POST"* ]]; then
  exit "${FAKE_LOCK_STATUS:-0}"
fi
if [[ "$*" == *"--jq .object.sha"* ]]; then
  printf '%s\n' "${FAKE_COMMIT}"
  exit 0
fi
if [[ "$*" == *"--method DELETE"* ]]; then
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
  current="$(tail -n 1 "${UPDATE_LOG}" 2>/dev/null)"
  printf '%s\n' "${current:-${FAKE_PREVIOUS_IMAGE}}"
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
    "${HARNESS}/repo/scripts/verify-registry-console-image.sh" \
    "${HARNESS}/repo/scripts/verify-console-containerapp-config.sh"
  CALL_LOG="${HARNESS}/calls.log"
  UPDATE_LOG="${HARNESS}/updates.log"
  mkdir -p "${HARNESS}/repo/docs/ops"
  printf '%s\n' UNCONFIGURED \
    >"${HARNESS}/repo/docs/ops/production-clerk-publishable-key.sha256"
  : >"${CALL_LOG}"
  : >"${UPDATE_LOG}"
}

run_fake_deploy() {
  env PATH="${HARNESS}/bin:${PATH}" \
    CALL_LOG="${CALL_LOG}" \
    UPDATE_LOG="${UPDATE_LOG}" \
    FAKE_REPO_ROOT="${HARNESS}/repo" \
    FAKE_BRANCH="${FAKE_BRANCH}" \
    FAKE_COMMIT="${FAKE_COMMIT}" \
    FAKE_REMOTE_COMMIT="${FAKE_REMOTE_COMMIT}" \
    FAKE_PREVIOUS_IMAGE="${FAKE_PREVIOUS_IMAGE}" \
    FAKE_RUN_ID="${FAKE_RUN_ID}" \
    FAKE_DIGEST="${FAKE_DIGEST}" \
    FAKE_NEW_IMAGE="${FAKE_NEW_IMAGE:-}" \
    FAKE_CI_STATUS="${FAKE_CI_STATUS:-0}" \
    FAKE_REGISTRY_STATUS="${FAKE_REGISTRY_STATUS:-0}" \
    FAKE_LOCK_STATUS="${FAKE_LOCK_STATUS:-0}" \
    FAKE_CONFIG_STATUS="${FAKE_CONFIG_STATUS:-0}" \
    FAKE_NEW_CONFIG_STATUS="${FAKE_NEW_CONFIG_STATUS:-0}" \
    FAKE_DIRTY_STATUS="${FAKE_DIRTY_STATUS:-0}" \
    FAKE_UPDATE_STATUS="${FAKE_UPDATE_STATUS:-0}" \
    FAKE_ROLLBACK_UPDATE_STATUS="${FAKE_ROLLBACK_UPDATE_STATUS:-0}" \
    VITE_CLERK_PUBLISHABLE_KEY="pk_test_c2FmZS10ZXN0LW9ubHkk" \
    CONSOLE_RELEASE_VERIFY_ATTEMPTS=1 \
    CONSOLE_RELEASE_VERIFY_DELAY_SECONDS=0 \
    "${HARNESS}/repo/scripts/deploy-console-prod.sh" --yes
}

reset_deploy_harness() {
  : >"${CALL_LOG}"
  : >"${UPDATE_LOG}"
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
}

test_deploy_guard() {
  local expected_image
  make_deploy_harness
  FAKE_COMMIT="$(printf '2%.0s' {1..40})"
  FAKE_RUN_ID="ca123"
  FAKE_DIGEST="sha256:$(printf '3%.0s' {1..64})"
  expected_image="ledgracr.azurecr.io/workforceos-fe@${FAKE_DIGEST}"
  FAKE_NEW_IMAGE="${expected_image}"
  reset_deploy_harness

  run_fake_deploy >/dev/null
  assert_contains "${CALL_LOG}" "verify-ci ${FAKE_COMMIT}"
  assert_contains "${CALL_LOG}" "git archive --format=tar ${FAKE_COMMIT}"
  assert_contains "${CALL_LOG}" "--secret-build-arg VITE_CLERK_PUBLISHABLE_KEY="
  assert_contains "${CALL_LOG}" "--build-arg VITE_CLERK_PUBLISHABLE_KEY_SHA256=d0aff3861e7d1ae6baf25cd8bc5f10c9e9b0162b577d5d41eeeb93cb70eb524a"
  assert_contains "${CALL_LOG}" "verify-registry ${expected_image} ${FAKE_COMMIT} d0aff3861e7d1ae6baf25cd8bc5f10c9e9b0162b577d5d41eeeb93cb70eb524a"
  assert_contains "${CALL_LOG}" "gh api --method POST repos/Kloudedge-apex/Workforce-OS/git/refs"
  assert_contains "${CALL_LOG}" "gh api --method DELETE repos/Kloudedge-apex/Workforce-OS/git/refs/heads/workforce-os-release-lock/production-console"
  assert_before "${CALL_LOG}" "gh api --method POST" "az containerapp show"
  assert_contains "${CALL_LOG}" "az containerapp update --name nikxius-web"
  assert_before "${CALL_LOG}" "verify-registry" "az containerapp update"
  [[ "$(tail -n 1 "${UPDATE_LOG}")" == "${expected_image}" ]] || fail "deploy did not select exact digest"
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
  FAKE_DIRTY_STATUS=1
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy accepted tracked source drift"
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
  FAKE_NEW_CONFIG_STATUS=1
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy reported success after new revision verification failed"
  fi
  [[ "$(sed -n '1p' "${UPDATE_LOG}")" == "${expected_image}" ]] || fail "new image was not attempted"
  [[ "$(sed -n '2p' "${UPDATE_LOG}")" == "${FAKE_PREVIOUS_IMAGE}" ]] || fail "previous digest was not restored"
  assert_excludes "${CALL_LOG}" "gh api --method DELETE repos/Kloudedge-apex/Workforce-OS/git/refs/heads/workforce-os-release-lock/production-console"
  pass

  reset_deploy_harness
  FAKE_NEW_CONFIG_STATUS=1
  FAKE_ROLLBACK_UPDATE_STATUS=1
  if run_fake_deploy >/dev/null 2>&1; then
    fail "deploy reported success after rollback failed"
  fi
  assert_contains "${CALL_LOG}" "gh api --method POST repos/Kloudedge-apex/Workforce-OS/git/refs"
  assert_excludes "${CALL_LOG}" "gh api --method DELETE repos/Kloudedge-apex/Workforce-OS/git/refs/heads/workforce-os-release-lock/production-console"
  pass
}

test_source_contract
test_registry_verifier
test_github_ci_verifier
test_containerapp_verifier
test_deploy_guard

echo "Console release script tests passed: ${TESTS_PASSED}"
