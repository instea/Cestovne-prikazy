const dbSchema = require('../db/schema');

function makeUnknownUser(id) {
  // if the ID was provided - create dummy user, return undefined otherwise (e.g. when loading user by undefined ID)
  return id ? {
    id: id,
    email: `${id}@deleted.instea.co`,
    firstName: 'Deleted',
    surname: `${id}`,
    isAdmin: false,
    approved: false,
  } : undefined;
}

module.exports.getUser = (id) => dbSchema.User.findOne({ id });
module.exports.getUserByEmail = (email) => dbSchema.User.findOne({ email });
module.exports.getUserOrDefault = (id) =>
  dbSchema.User.findOne({ id }) || makeUnknownUser(id);
