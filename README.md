# Trips management

Application for management of trips.

## Getting Started

### Prerequisites

* node
* docker, docker-compose (for database)

### Installing

Clone the repository
```
git clone ... ; cd trips
```

Start by installing the dependencies:

```
npm install
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

## Running

You need to run the client and server application. Client side is run by issuing npm start command:

```
npm start
```

If using the dockerized mongo instance with no authentication, the server can be run by this command:

```
npm run server
```

Otherwise, mongo url needs to be set:

```
MONGO_URL=mongodb://user:pass@localhost:port/database npm run server
```

## Running the tests

TODO

### And coding style tests

TODO

## Deployment

To deploy

## Built With

* [create-react-app](https://github.com/facebookincubator/create-react-app)
  * React - Web application framework
  * Webpack - build system
* [MongoDB](https://www.mongodb.com/) - NoSQL database
* [Mongoose](http://mongoosejs.com/) - ORM library for MongoDB in javascript
* [express](https://expressjs.com/) - Back-end web framework
* [express-graphql](https://github.com/graphql/express-graphql) - GraphQL server
* [apollo-client](https://github.com/apollographql/apollo-client) - GraphQL client
