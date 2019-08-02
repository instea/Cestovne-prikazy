const schema = require('./schema');
const mongoose = require('mongoose');
const User = require('../../src/data/User');

module.exports = () => mongoose.connection.on('open', () => {

  console.log('refreshing DB');
  schema.User.remove({}).then(res => {
    const isAdmin = true;
    // you need to setup first user (admin) with data for google login
    new schema.User(User.create({
      id: '', // use google user_id
      firstName: 'I am',
      surname: 'Admin',
      degrees: '',
      address: '',
      email: '', // use email of google user
      approved: true
    }, isAdmin))
      .save()
      .then(() => {
        console.log('User created');
        console.log('DB Setup successful');
        process.exit(0);
      });
  });

});
