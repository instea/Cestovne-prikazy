const express = require('express');
const bodyParser = require('body-parser');
const graphqlHTTP = require('express-graphql');
const schema = require('./graphql/schema');
const rootValue = require('./graphql/rootValue');
require('./db/connect');
const setupAuth = require('./auth/setup');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const exportToXlsx = require('./export/toXlsx');

if (process.argv.some(a => a === '--fill-db')) {
  require('./db/setup')();
  return;
}

const app = express();
const PORT = 4100;

const downloadFolder = path.join(__dirname, 'download');
try {
  fs.mkdirSync(downloadFolder);
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e;
  }
}
app.use('/download', express.static(downloadFolder));

setupAuth(app, '/', '/refresh-jwt');
// CORS needed for dev
app.use('/graphql', cors(), graphqlHTTP((req) => ({
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
    res.json('http://' + req.headers.host + '/' + path.relative(__dirname, filename));
  } catch (e) {
    console.error(e);
    return res.status(500).end();
  }
});

app.use('/leaves/', express.static(path.join(__dirname, '../angular/dist')));
// Serving index for all routes, so that angular routing could be used
app.get('/leaves/*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../angular', 'dist', 'index.html'));
});

app.use('/', express.static(path.join(__dirname, '../build')));
// Serving index for all routes, so that react routing could be used
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'build', 'index.html'));
});

app.listen(PORT, () => console.log('Listening on port', PORT));

module.exports = app;
