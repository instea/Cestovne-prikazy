const schema = require('./schema');
const mongoose = require('mongoose');
const uuid = require('uuid');
const User = require('../../src/data/User');
const {hashPassword} = require('../auth/operations');

module.exports = () => mongoose.connection.on('open', () => {

  console.log('refreshing DB');
  schema.User.remove({}).then(res => {

    const isAdmin = true;
    hashPassword('passw0rd', 10).then((hash) => {
      new schema.User(User.create({
        id: uuid.v4(),
        username: 'admin',
        firstName: 'Non',
        surname: 'Admin',
        degrees: '',
        address: '',
        email: '',
        approved: true
      }, hash, isAdmin))
        .save()
        .then(() => {
          console.log('User created');
          console.log('DB Setup successful');
          process.exit(0);
        });
    });

  });

});
