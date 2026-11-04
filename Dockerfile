FROM node:8 AS builder

ARG REACT_APP_HOSTED_DOMAIN=instea.co
ARG REACT_APP_CLIENT_ID=914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e.apps.googleusercontent.com

ENV REACT_APP_HOSTED_DOMAIN=$REACT_APP_HOSTED_DOMAIN
ENV REACT_APP_CLIENT_ID=$REACT_APP_CLIENT_ID

# build angular first (it might change less frequently)
WORKDIR /opt/app/angular

COPY angular/package.json angular/yarn.lock ./
RUN yarn install

COPY angular/ ./
RUN yarn build

WORKDIR /opt/app/

COPY package.json yarn.lock ./

# --ignore-engines: dev-only code quality tools (eslint 10, prettier 3, ...) need Node 20+.
# --ignore-scripts: their husky `prepare` hook can't run on Node 8; nothing in the build needs install scripts.
RUN yarn install --ignore-engines --ignore-scripts

# SKIP_PREFLIGHT_CHECK: root eslint 10 differs from the eslint 5 that react-scripts 3 expects.
COPY .env.production ./
COPY public ./public/
COPY src ./src/

RUN yarn build

FROM node:12.22-slim

WORKDIR /opt/app/
COPY --from=builder /opt/app/node_modules ./node_modules
COPY --from=builder /opt/app/build ./build
COPY --from=builder /opt/app/angular/dist ./angular/dist
COPY server/ ./server
# server reuse also client code
COPY src/ ./src

VOLUME /opt/app/secrets/

EXPOSE 4100
CMD ["node", "server/index.js"]

