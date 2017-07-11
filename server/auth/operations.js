const path = require('path');
const fs = require('fs');
const jwt = require('jwt-node');
const bcrypt = require('bcrypt');
const dbSchema = require('../db/schema');
const moment = require('moment');
const jwtNode = require('jwt-node');

const key = fs.readFileSync(path.join(__dirname, '../../secrets/key.pem'));

module.exports.createJwt = (user) => {
  if (!user) {
    return {};
  }

  const jwtClaim = jwt.create({
    sub: user.id
  }, key);
  jwtClaim.setExpiration(moment().add(3, 'hours').format('x') - 0);

  return jwtClaim;
};

const MSG_1 = 'Incorrect username or password';
module.exports.checkCredentials = (username, password, callback) => {
  dbSchema.User.findOne({name: username}, (err, user) => {
    if (err) {
      return callback(err);
    }
    if (!user) {
      return callback(MSG_1);
    }
    bcrypt.compare(password, user.password, (err, res) => {
      if (err || !res) {
        return callback(MSG_1);
      }
      callback(undefined, user);
    });
  });
};

module.exports.hashPassword = (password, callback) => {
  bcrypt.hash(password, 10, (err, hash) => {
    callback(hash);
  });
};
