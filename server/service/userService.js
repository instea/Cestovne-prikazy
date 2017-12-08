const dbSchema = require('../db/schema');

module.exports.getUser = id => dbSchema.User.findOne({ id });
