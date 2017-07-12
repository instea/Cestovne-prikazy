const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected} = require('../auth/rootResolverDecorators');
const Trip = require('../../src/data/Trip');
const simpleResult = require('./utils').simpleResult;

module.exports = {
  getTrips: userProtected(() => new Promise((resolve, reject) => {
    dbSchema.Trip.find({}, (err, trips) => {
      if (err) {
        reject();
      }
      resolve(trips.map(Trip.toMongo));
    });
  })),

  getTrip: userProtected(({id}) => new Promise((resolve, reject) => {
    dbSchema.Trip.findOne({id: id}, (err, trip) => {
      if (err) {
        reject();
      }
      resolve(Trip.toMongo(trip));
    });
  })),

  createTrip: userProtected(({trip}) => new Promise((resolve, reject) => {
    new dbSchema.Trip(Trip.toMongo(Object.assign({
      id: uuid.v4()
    }, trip))).save((err, _trip) => {
      resolve(_trip);
    });
  })),

  updateTrip: userProtected(({id, trip}) => new Promise((resolve, reject) => {
    dbSchema.Trip.findOneAndUpdate({id: id}, {'$set': Trip.toMongo(trip)}, simpleResult(resolve, reject));
  })),

  removeTrip: userProtected(({id}) => new Promise((resolve, reject) => {
    dbSchema.Trip.findOneAndRemove({id: id}, simpleResult(resolve, reject));
  }))
};
