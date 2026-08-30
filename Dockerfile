# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32
# Single-container Workforce OS FE + BFF for the isolated production Container App and ACR.
# The api-server (BFF) serves the built Vite FE (FE_DIST) and /api.

ARG NODE_IMAGE=node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

FROM ${NODE_IMAGE} AS build
# Pin pnpm to the repo's known-good version (corepack would otherwise pull pnpm 11,
# which fails the install on ignored build scripts — ERR_PNPM_IGNORED_BUILDS).
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app
COPY . .
# Lockfile deps install fine under the 1-day minimumReleaseAge gate (it only blocks new versions).
RUN pnpm install --frozen-lockfile
# FE build needs PORT + BASE_PATH at vite config-eval; BFF builds via esbuild.
# VITE_CLERK_PUBLISHABLE_KEY is inlined at build and must be supplied explicitly.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PUBLISHABLE_KEY_SHA256
RUN test -n "${VITE_CLERK_PUBLISHABLE_KEY}" \
 && test -n "${VITE_CLERK_PUBLISHABLE_KEY_SHA256}" \
 && VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY}" \
    EXPECTED_SHA256="${VITE_CLERK_PUBLISHABLE_KEY_SHA256}" \
    node -e 'const {createHash}=require("node:crypto"); const actual=createHash("sha256").update(process.env.VITE_CLERK_PUBLISHABLE_KEY).digest("hex"); if (actual !== process.env.EXPECTED_SHA256) { console.error("Clerk publishable-key digest mismatch"); process.exit(1); }'
RUN PORT=8080 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY} \
      pnpm --filter @workspace/workforce-os run build \
 && pnpm --filter @workspace/api-server run build

# Materialize only the BFF production dependency graph. The browser bundle is
# static output, so no frontend build tools or repository source are required
# by the runtime image.
RUN pnpm --filter @workspace/api-server deploy --prod --legacy /opt/api-server

FROM ${NODE_IMAGE} AS runtime

ARG VCS_REF=unknown
ARG VITE_CLERK_PUBLISHABLE_KEY_SHA256=unknown

LABEL org.opencontainers.image.title="Workforce OS console and BFF" \
      org.opencontainers.image.description="Guarded Workforce OS SDR browser console and same-origin BFF" \
      org.opencontainers.image.source="https://github.com/Kloudedge-apex/Workforce-OS" \
      org.opencontainers.image.revision="${VCS_REF}" \
      io.workforceos.clerk-publishable-key.sha256="${VITE_CLERK_PUBLISHABLE_KEY_SHA256}"

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# FE_DIST points the BFF at the built SPA. CLERK_JWKS_URL, CLERK_ISSUER,
# CLERK_AUTHORIZED_PARTIES, and API_UPSTREAM_URL are injected at deploy (D2).
# CLERK_AUDIENCE stays unset unless session tokens carry it; DEV_TRUST_X_ORG_ID
# stays false and is ignored unconditionally when NODE_ENV=production.
ENV FE_DIST=/app/artifacts/workforce-os/dist/public
# Bring only the BFF runtime package, its production dependencies (including
# pino worker support), and the built browser assets.
COPY --from=build --chown=node:node /opt/api-server/node_modules ./node_modules
COPY --from=build --chown=node:node /opt/api-server/package.json ./artifacts/api-server/package.json
COPY --from=build --chown=node:node /opt/api-server/dist ./artifacts/api-server/dist
COPY --from=build --chown=node:node /app/artifacts/workforce-os/dist/public ./artifacts/workforce-os/dist/public

USER node

EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
