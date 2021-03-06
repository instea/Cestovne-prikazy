# Trips management

Application for management of trips.

## Getting Started
Application use Google login as only mean of registration/login ([google-sign-in](https://developers.google.com/identity/sign-in/web/sign-in)).
All users must register and be approved by admin before being able to login.
For this reason admin user must be seeded into application database.
See **setup DB** chapter to find all necessary information.

All users can be restricted to hosted domain, see **Environmental variables**. 

### Prerequisites

* node 8
* yarn
* docker, docker-compose (for database)

### Installing

Clone the repository
```
git clone https://github.com/instea/Cestovne-prikazy.git ; cd Cestovne-prikazy
```

Start by installing the dependencies:

```
yarn install
```

The application needs a running Mongo instance for it to work. It can be pointed to any such instance.
It can be set by setting the environment variable _MONGO\_URL_ to an url in this format:

```
mongodb://user:pass@localhost:port/database
```

If no mongo instance is readily available, the repository contains a docker compose file to quickly start a new instance:

```
pushd db
docker-compose up -d
popd
```

No authentication will be used by default. If it is required, read instructions at [mongo docker page](https://hub.docker.com/_/mongo/).

The application also requires some secret files that are not present in the repository:
* secrets/key.pem - private and public key

Those can be generated by running:

```
openssl genrsa -out ./secrets/key.pem 2048
```

and then extracting the Base64 content into private.key and public.pem files.

## Setup DB

Database is not initialized with default admin user due to Google login as only
mean of user registration and login (you would need to supply google_id and email).
Instead of it, create user via Google login and then use following command to grant
user with given email admin rights (can approve other users via GUI) 
and approved status (can login into app).
```
yarn promote-user --email=<google_email>
```

## Running
If using the dockerized mongo instance with no authentication, the server can be run by this command:

```
yarn server
```

Otherwise, mongo url needs to be set:

```
MONGO_URL=mongodb://user:pass@localhost:port/database yarn server
```
#### Environmental variables
When server is running, various environmental variables are used.
 
Server environmental variables to generate and send emails. When some of SMTP options are not set, emails are not sent. 
```
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
BASE_URL - root url of frontend webpage
APPROVAL_MAIL_RECEIVER - email address to send emails about new leaves to
MAIL_SENDER - name of email sender
DEFAULT_TIMEZONE - default timezone used to format datetime in emails, 
                   if not set, 'Europe/Bratislava' is used
```

Server environmental variables for Google login. When HOSTED_DOMAIN is set, all users 
must belong to given hosted domain, otherwise they won't be able to register/login.
```
HOSTED_DOMAIN=instea.co
CLIENT_ID=914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e.apps.googleusercontent.com
```

#### Attendence API
Endpoint to get attendence of users for given year and month (supply month as integer from 1 (January) to 12 (December))
**/api/attendence/:year/:month**

This endpoint uses following environment variables: 
```
M2M_USERNAME - username for HTTP Basic authentication
M2M_PASSWORD - password for HTTP Basic authentication
SSO_URI      - URI of SSO Metadata endpoint to get all keys for users
SSO_USERNAME - SSO username used for HTTP Basic authentication
SSO_PASSWORD - SSO password used for HTTP Basic authentication
```


You need to run the client and server application. Client side is run by issuing yarn start command:

```
yarn start
```
Client environmental variables for Google login (e.g. in `.env.local`). When REACT_APP_HOSTED_DOMAIN is set, only emails
of given domain are shown in Google login form.
```
REACT_APP_HOSTED_DOMAIN=instea.co
REACT_APP_CLIENT_ID=914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e.apps.googleusercontent.com
```

## Running the tests

```
yarn test
```

### Coding style tests

The project uses ESLint for docing style tests. You can run them by:

```
yarn lint
```

Automatic fixing can be done by running:

```
yarn format
```

## Deployment

Build docker

```
# assumes build env variables are set
docker build --build-arg REACT_APP_HOSTED_DOMAIN --build-arg REACT_APP_CLIENT_ID -t cestaky:master .

# just example: needs -e params to work properly
docker run --rm --name cestaky -v "/$(pwd)/secrets:/opt/app/secrets" -p 4100:4100 cestaky:master
```

## See also

[Subproject for leaves management](angular/README.md)

## Built With

* [create-react-app](https://github.com/facebookincubator/create-react-app)
  * React - Web application framework
  * Webpack - build system
* [MongoDB](https://www.mongodb.com/) - NoSQL database
* [Mongoose](http://mongoosejs.com/) - ORM library for MongoDB in javascript
* [express](https://expressjs.com/) - Back-end web framework
* [express-graphql](https://github.com/graphql/express-graphql) - GraphQL server
* [apollo-client](https://github.com/apollographql/apollo-client) - GraphQL client
