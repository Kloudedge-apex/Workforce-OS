# syntax=docker/dockerfile:1
# Single-container Nikxius FE + BFF for Azure Container Apps (RG Ledgr-prod / ACR ledgracr).
# The api-server (BFF) serves the built Vite FE (FE_DIST) and /api.

FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
# Lockfile deps install fine under the 1-day minimumReleaseAge gate (it only blocks new versions).
RUN pnpm install --frozen-lockfile
# FE build needs PORT + BASE_PATH at vite config-eval; BFF builds via esbuild.
# VITE_CLERK_PUBLISHABLE_KEY is inlined at build (App.tsx falls back to the prod live key).
ARG VITE_CLERK_PUBLISHABLE_KEY
RUN PORT=8080 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY} \
      pnpm --filter @workspace/workforce-os run build \
 && pnpm --filter @workspace/api-server run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# FE_DIST points the BFF at the built SPA; CLERK_JWKS_URL / API_UPSTREAM_URL are
# injected as Container App env/secrets at deploy (D2). DEV_TRUST_X_ORG_ID stays false.
ENV FE_DIST=/app/artifacts/workforce-os/dist/public
# Bring the built workspace (BFF dist + node_modules for pino worker threads + FE dist).
COPY --from=build /app /app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
