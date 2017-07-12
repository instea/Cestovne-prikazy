const schema = require('./schema');
const mongoose = require('mongoose');
const uuid = require('uuid');
const bcrypt = require('bcrypt');
const User = require('../../src/data/User');

module.exports = () => mongoose.connection.on('open', () => {

  schema.User.remove({}, (err) => {

    bcrypt.hash('password', 10, (err, hash) => {
      new schema.User(User.create({
        id: uuid.v4(),
        username: 'juraj'
      }, hash, true)).save();
    });

  });

});
