const mongoose = require('mongoose');
const {values: TRAVEL_TYPES} = require('../../src/data/TravelType');
const {COUNTRIES} = require('../../src/data/Countries');
const { LEAVE_TYPES } = require('../../src/data/LeaveType');
const { LEAVE_STATES } = require('../../src/data/LeaveState');

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
    country: {
      type: String,
      enum: COUNTRIES.map(c => c.code),
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
      enum: TRAVEL_TYPES.map(t => t.code),
      reqired: true
    },
    priceOfTravel: {
      type: Number,
      reqired: true
    }
  });
  TripSchema.index({id: 1});

  module.exports.Trip = mongoose.model('Trip', TripSchema);

  const LeaveSchema = mongoose.Schema({
    id: {
      type: String,
      reqired: true
    },
    requesterId: {
      type: String,
      reqired: true
    },
    approverId: {
      type: String,
      reqired: true
    },
    startDate: {
      type: Date,
      reqired: true
    },
    endDate: {
      type: Date,
      reqired: true
    },
    state: {
      type: String,
      enum: LEAVE_STATES.map(s => s.code),
      reqired: true
    },
    type: {
      type: String,
      enum: LEAVE_TYPES.map(t => t.code),
      reqired: true
    },
    isHalfDay: Boolean,
    numDays: Number,
  });
  LeaveSchema.index({id: 1});

  module.exports.Leave = mongoose.model('Leave', LeaveSchema);

});
