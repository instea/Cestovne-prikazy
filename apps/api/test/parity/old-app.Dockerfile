# MIG-03: the OLD app's server, built from the old source when the
# production image (registry.instea.co/cestovne-prikazy) is not available.
# Build context: `git archive <old ref> package.json yarn.lock server src`
# (prepared by run.mts). Same runtime as the old Dockerfile (node 12.22,
# `node server/index.js`, port 4100) and the exact old dependency versions
# from yarn.lock. Differences from the production image, none of which the
# attendance endpoint uses: no Angular / React bundles (`build`,
# `angular/dist`), install scripts skipped (bcrypt native build).
# Runs as the image's non-root `node` user (NFR-04, Trivy DS-0002): port
# 4100 needs no privilege, and the only path the server writes is
# server/download (created at startup, so it is created here owned by node).
FROM node:12.22-slim
WORKDIR /opt/app
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile --ignore-scripts \
      --non-interactive --network-timeout 600000 \
 && yarn cache clean
COPY server ./server
COPY src ./src
RUN mkdir -p server/download && chown node:node server/download
USER node
EXPOSE 4100
CMD ["node", "server/index.js"]
