const mongoose = require('mongoose');

const {ObjectID} = mongoose.Types;

mongoose.connection.on('open', () => {

  const TripSchema = mongoose.Schema({
    id: {
      type: String,
      reqired: true
    },
    from: {
      type: Date,
      reqired: true
    },
    to: {
      type: Date,
      reqired: true
    },
    place: {
      type: String,
      reqired: true
    }
  });
  TripSchema.index({id: 1});

  module.exports.Trip = mongoose.model('Trip', TripSchema);

  const UserSchema = mongoose.Schema({
    id: {
      type: String,
      reqired: true
    },
    name: {
      type: String,
      reqired: true
    },
    password: {
      type: String,
      reqired: true
    },
    isAdmin: {
      type: Boolean,
      reqired: true
    }
  });
  UserSchema.index({id: 1});

  module.exports.User = mongoose.model('User', UserSchema);

});
