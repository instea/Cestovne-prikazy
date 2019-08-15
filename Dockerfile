FROM node:8

ARG REACT_APP_HOSTED_DOMAIN=instea.co
ARG REACT_APP_CLIENT_ID=914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e.apps.googleusercontent.com

ENV REACT_APP_HOSTED_DOMAIN=$REACT_APP_HOSTED_DOMAIN
ENV REACT_APP_CLIENT_ID=$REACT_APP_CLIENT_ID

WORKDIR /opt/app/
COPY . .

RUN ./bin/build.sh

VOLUME /opt/app/secrets/

EXPOSE 4100
CMD ["node", "server/index.js"]

