const _ = require('lodash');

module.exports.create = (userData, isAdmin) =>
  Object.assign(_.pick(userData, ['id', 'firstName', 'surname', 'degrees', 'address', 'email', 'approved']), typeof isAdmin === 'boolean' ? {
    isAdmin
  } : {});
