# syntax=docker/dockerfile:1
# OPS-03: one image builds packages/shared, apps/api and the apps/web SPA;
# NestJS serves both on port 4100. No environment-specific build args: the
# SPA reads its Google settings from GET /api/auth/config at runtime.

FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS deps
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0
RUN corepack enable
WORKDIR /repo
# Manifests only, so the install layer is cached until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=$APP_VERSION
COPY . .
RUN pnpm -r build
# Production dependencies only (no devDependencies) plus apps/api/dist.
# --legacy: the workspace does not inject workspace packages, which the
# default deploy mode requires.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm deploy --filter @leaves/api --prod --legacy /out

FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS runtime
ARG APP_VERSION=0.0.0-dev
ENV NODE_ENV=production \
    APP_VERSION=$APP_VERSION \
    PORT=4100
# npm and Corepack are not needed at runtime; removing them shrinks the
# attack surface scanned by Trivy (NFR-04).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /opt/app
# Files stay owned by root, so the app user cannot modify its own code.
COPY --from=build /out ./
COPY --from=build /repo/apps/web/dist ./public
USER node
EXPOSE 4100
CMD ["node", "dist/main.js"]
