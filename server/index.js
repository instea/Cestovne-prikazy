const express = require('express');
const bodyParser = require('body-parser');
const graphqlHTTP = require('express-graphql');
const schema = require('./graphql/schema');
const rootValue = require('./graphql/rootValue');
require('./db/connect');
const setupAuth = require('./auth/setup');
const path = require('path');

const exportToXlsx = require('./export/toXlsx');

if (process.argv.some(a => a === '--fill-db')) {
  require('./db/setup')();
}

const app = express();
const PORT = 4100;

app.use('/download', express.static(path.join(__dirname, 'download')));

setupAuth(app, '/', '/refresh-jwt');
app.use('/graphql', graphqlHTTP((req) => ({
  schema: schema,
  rootValue: rootValue,
  context: req.context,
  graphiql: true
})));

app.use('/export', bodyParser.json());
app.post('/export', async (req, res) => {
  if (!req.context || !req.context.user) {
    return res.status(401).end();
  }

  try {
    const filename = await exportToXlsx(req.body);
    res.json('http://' + req.headers.host + "/" + path.relative(__dirname, filename));
  } catch (e) {
    console.error(e);
    return res.status(500).end();
  }
});

app.use('/', express.static(path.join(__dirname, '../build')));
app.listen(PORT, () => console.log('Listening on port', PORT));

module.exports = app;
