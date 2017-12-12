const dbSchema = require('../db/schema');

module.exports.getLeave = id => dbSchema.Leave.findOne({ id });
