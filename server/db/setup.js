const schema = require('./schema');
const mongoose = require('mongoose');
const uuid = require('uuid');
const bcrypt = require('bcrypt');

module.exports = () => mongoose.connection.on('open', () => {

  schema.User.remove({}, (err) => {

    bcrypt.hash('password', 10, (err, hash) => {
      new schema.User({
        id: uuid.v4(),
        name: 'juraj',
        password: hash,
        isAdmin: true
      }).save();
    });

  });

});
