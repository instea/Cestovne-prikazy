const path = require('path');
const fs = require('fs');
const jwt = require('jwt-node');
const bcrypt = require('bcrypt');
const dbSchema = require('../db/schema');
const moment = require('moment');

const key = fs.readFileSync(path.join(__dirname, '../../secrets/key.pem'));

module.exports.createJwt = (user) => {
  if (!user) {
    return {};
  }

  const jwtClaim = jwt.create({
    sub: user.id
  }, key);
  jwtClaim.setExpiration(moment().add(1, 'hour').format('x') - 0);

  return jwtClaim;
};

const MSG_1 = 'Incorrect username or password';
module.exports.checkCredentials = (username, password) => new Promise((resolve, reject) => {
  dbSchema.User.findOne({username: username}).then(user => {
    if (!user) {
      return reject(MSG_1);
    }
    bcrypt.compare(password, user.password, (err, res) => {
      if (err || !res) {
        return reject(MSG_1);
      }
      resolve(user);
    });
  }).catch(err => {
    return reject(err);
  });
});

module.exports.hashPassword = (password) => new Promise((resolve, reject) => {
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      return reject(err);
    }
    resolve(hash);
  });
});

module.exports.refreshJwt = (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, key, (err, res) => {
      const user = {};

      if (res) {
        user.id = res.body.sub;
      }
      if (err && err.parsedBody) {
        user.id = err.parsedBody.sub;
      }
      resolve(module.exports.createJwt(user));
    });
  });
};
