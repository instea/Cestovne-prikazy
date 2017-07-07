const express = require('express');
const graphqlHTTP = require('express-graphql');
const schema = require('./graphql/schema');
const rootValue = require('./graphql/rootValue');
require('./db/connect');
const setupAuth = require('./auth/setup');

if (process.argv.some(a => a === '--fill-db')) {
   require('./db/setup')();
}

const app = express();

setupAuth(app, '/graphql');
app.use('/graphql', graphqlHTTP((req) => ({
  schema: schema,
  rootValue: rootValue,
  context: req.context,
  graphiql: true
})));

app.listen(4000);

module.exports = app;
