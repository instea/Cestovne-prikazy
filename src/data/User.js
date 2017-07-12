const _ = require('lodash');

module.exports.create = (userData, password, isAdmin) =>
  Object.assign(_.pick(userData, ['id', 'username']), password ? {
    password: password
  } : {}, typeof isAdmin === 'boolean' ? {
    isAdmin
  } : {});
