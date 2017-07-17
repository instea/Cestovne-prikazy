const schema = require('./schema');
const mongoose = require('mongoose');
const uuid = require('uuid');
const User = require('../../src/data/User');
const {hashPassword} = require('../auth/operations');

module.exports = () => mongoose.connection.on('open', () => {

  schema.User.remove({}).then(res => {

    hashPassword('password', 10).then((hash) => {
      new schema.User(User.create({
        id: uuid.v4(),
        username: 'juraj',
        firstName: 'Juraj',
        surname: 'Matuš',
        degrees: 'Ing.',
        address: 'Matičná 30, 900 28, Ivanka pri Dunaji'
      }, hash, true)).save();
    });

  });

});
