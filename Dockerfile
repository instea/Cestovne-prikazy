FROM node:8

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

COPY . .

RUN yarn build

VOLUME /opt/app/secrets/

EXPOSE 4100
CMD ["node", "server/index.js"]

