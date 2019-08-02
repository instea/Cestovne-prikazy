const schema = require('./schema');
const mongoose = require('mongoose');
const User = require('../../src/data/User');

module.exports = (email) => mongoose.connection.on('open', () => {
  schema.User.findOneAndUpdate({email: email}, {'$set': {approved: true, isAdmin: true}})
    .then(user => {
      if (user) {
        console.log('User with email \'%s\' promoted to admin and approved.', email);
        process.exit(0);
      }
      console.log('User with email \'%s\' not found.', email);
      process.exit(1);
    })
    .catch(err => {
      console.log(err);
      process.exit(1);
    })
});
