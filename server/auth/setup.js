const path = require('path');
const fs = require('fs');
const jwt = require('express-jwt');
const dbSchema = require('../db/schema');
const {refreshJwt} = require('./operations');

const key = fs.readFileSync(path.join(__dirname, '../../secrets/key.pem'));

module.exports = (app, path, refreshPath) => {
  if (refreshPath) {
    app.post(refreshPath, (req, res) => {
      if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        const token = req.headers.authorization.split(' ')[1];
        refreshJwt(token).then(jwt => res.json(jwt.compact())).catch(err => res.status(401).end());
      } else {
        res.status(401).end();
      }
    });
  }
  app.use(path, jwt({
    secret: key,
    credentialsRequired: false
  }));
  app.use(path, (req, res, done) => {
    req.context = {};
    if (!req || !req.user || !req.user.sub) {
      return done();
    }
    dbSchema.User.findOne({id: req.user.sub}).then(user => {
      if (user) {
        req.context = {
          user: user
        };
      }
      done();
    }).catch(err => {
      done();
    });
  });
  app.use(path, (err, req, res, done) => {
    if (err && err.constructor.name === 'UnauthorizedError') {
      return done();
    }
  });
};
