# MIG-03: the OLD app's server, built from the old source when the
# production image (registry.instea.co/cestovne-prikazy) is not available.
# Build context: `git archive <old ref> package.json yarn.lock server src`
# (prepared by run.mts). Same runtime as the old Dockerfile (node 12.22,
# `node server/index.js`, port 4100) and the exact old dependency versions
# from yarn.lock. Differences from the production image, none of which the
# attendance endpoint uses: no Angular / React bundles (`build`,
# `angular/dist`), install scripts skipped (bcrypt native build).
FROM node:12.22-slim
WORKDIR /opt/app
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile --ignore-scripts \
      --non-interactive --network-timeout 600000 \
 && yarn cache clean
COPY server ./server
COPY src ./src
EXPOSE 4100
CMD ["node", "server/index.js"]
