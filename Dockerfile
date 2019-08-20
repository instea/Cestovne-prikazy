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

RUN yarn install

COPY public ./public/
COPY src ./src/

RUN yarn build

FROM node:8-slim

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

