const schema = require('./schema');
const mongoose = require('mongoose');
const uuid = require('uuid');

module.exports = () => mongoose.connection.on('open', () => {

   schema.User.remove({}, (err) => {

      new schema.User({
         id: uuid.v4(),
         name: 'juraj',
         password: '',
         isAdmin: true
      }).save();

   });

});
