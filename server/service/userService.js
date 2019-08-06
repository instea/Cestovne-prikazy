const dbSchema = require('../db/schema');

module.exports.getUser = id => dbSchema.User.findOne({ id });
module.exports.getUserByEmail = email => dbSchema.User.findOne({ email });
