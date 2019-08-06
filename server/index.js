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

const exportMiddleware = require('./export/exportMiddleware');

const argv = require('minimist')(process.argv.slice(2));

if (argv['email']) {
  require('./db/promoteUser')(argv['email']);
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

// CORS needed for dev
app.use(cors());

setupAuth(app, '/', '/refresh-jwt');
app.use('/graphql', graphqlHTTP((req) => ({
  schema: schema,
  rootValue: rootValue,
  context: req.context,
  graphiql: true
})));

app.use('/export/*', bodyParser.json());
app.post('/export/*', exportMiddleware);

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
