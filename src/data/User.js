const _ = require('lodash');

module.exports.create = (userData, password, isAdmin) =>
  Object.assign(_.pick(userData, ['id', 'firstName', 'surname', 'degrees', 'address', 'email', 'approved']), password ? {
    password: password
  } : {}, typeof isAdmin === 'boolean' ? {
    isAdmin
  } : {});
