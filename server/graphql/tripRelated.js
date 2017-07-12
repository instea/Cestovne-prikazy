const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected} = require('../auth/rootResolverDecorators');
const Trip = require('../../src/data/Trip');
const simpleResult = require('./utils').simpleResult;
const userResolvers = require('./userRelated');
const placeResolvers = require('./placeRelated');

const resolveForeignKeys = (trip) => {
  return Object.assign(trip, {
    user: (_, ...args) => userResolvers.getUser({id: trip.userId}, ...args),
    place: (_, ...args) => placeResolvers.getPlace({id: trip.placeId}, ...args)
  });
};

module.exports = {
  getTrips: userProtected(() => new Promise((resolve, reject) => {
    dbSchema.Trip.find({}, (err, trips) => {
      if (err) {
        reject();
      }
      resolve(trips.map((trip) => resolveForeignKeys(Trip.toSerializable(trip))));
    });
  })),

  getTrip: userProtected(({id}) => new Promise((resolve, reject) => {
    dbSchema.Trip.findOne({id: id}, (err, trip) => {
      if (err) {
        reject();
      }
      resolve(resolveForeignKeys(Trip.toSerializable(trip)));
    });
  })),

  createTrip: userProtected(({trip}) => new Promise((resolve, reject) => {
    new dbSchema.Trip(Trip.toMongo(Object.assign(trip, {
      id: uuid.v4()
    }))).save((err, _trip) => {
      resolve(resolveForeignKeys(Trip.toSerializable(_trip)));
    });
  })),

  updateTrip: userProtected(({id, trip}) => new Promise((resolve, reject) => {
    dbSchema.Trip.findOneAndUpdate({id: id}, {'$set': Trip.toMongo(trip)}, simpleResult(resolve, reject));
  })),

  removeTrip: userProtected(({id}) => new Promise((resolve, reject) => {
    dbSchema.Trip.findOneAndRemove({id: id}, simpleResult(resolve, reject));
  }))
};
