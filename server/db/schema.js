const mongoose = require('mongoose');

mongoose.connection.on('open', () => {

  const PlaceSchema = mongoose.Schema({
    id: {
      type: String,
      reqired: true
    },
    name: {
      type: String,
      reqired: true
    },
    destinationName: {
      type: String,
      reqired: true
    },
    originName: {
      type: String,
      reqired: true
    },
    travelDuration: {
      type: String,
      reqired: true
    }
  });
  PlaceSchema.index({id: 1});

  module.exports.Place = mongoose.model('Place', PlaceSchema);

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
    username: {
      type: String,
      reqired: true
    },
    password: {
      type: String,
      reqired: true
    },
    firstName: String,
    surname: String,
    degrees: String,
    address: String,
    isAdmin: {
      type: Boolean,
      reqired: true
    }
  });
  UserSchema.index({id: 1});

  module.exports.User = mongoose.model('User', UserSchema);

});
