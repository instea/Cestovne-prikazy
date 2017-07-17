const mongoose = require('mongoose');
const TravelType = require('../../src/data/TravelType');

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
    },
    basicTariff: {
      type: Number
    }
  });
  PlaceSchema.index({id: 1});

  module.exports.Place = mongoose.model('Place', PlaceSchema);

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

  const TripSchema = mongoose.Schema({
    id: {
      type: String,
      reqired: true
    },
    userId: {
      type: String,
      reqired: true
    },
    placeId: {
      type: String,
      reqired: true
    },
    departureTime: {
      type: Date,
      reqired: true
    },
    arrivalTime: {
      type: Date,
      reqired: true
    },
    purpose: {
      type: String,
      reqired: true
    },
    travelType: {
      type: String,
      enum: TravelType.values.map(t => t.code),
      reqired: true
    },
    priceOfTravel: {
      type: Number,
      reqired: true
    }
  });
  TripSchema.index({id: 1});

  module.exports.Trip = mongoose.model('Trip', TripSchema);

});
