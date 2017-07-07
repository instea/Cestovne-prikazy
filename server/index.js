const express = require('express');
const graphqlHTTP = require('express-graphql');
const schema = require('./graphql/schema');
const rootValue = require('./graphql/rootValue');
require('./db/connect');

const app = express();

app.use('/graphql', graphqlHTTP({
  schema: schema,
  rootValue: rootValue,
  graphiql: true
}));

app.listen(4000);

module.exports = app;
