const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected, ownerProtected} = require('../auth/rootResolverDecorators');
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
  getTrips: userProtected(() => dbSchema.Trip.find({})
    .then(trips => trips.map((trip) => resolveForeignKeys(Trip.toSerializable(trip))))),

  getTrip: userProtected(({id}) => dbSchema.Trip.findOne({id: id})
    .then((trip) => resolveForeignKeys(Trip.toSerializable(trip)))),

  createTrip: userProtected(({trip}) => (new dbSchema.Trip(Trip.toMongo(Object.assign(trip, {
    id: uuid.v4()
  }))).save().then((_trip) => resolveForeignKeys(Trip.toSerializable(_trip))))),

  updateTrip: ownerProtected(({id, trip}, context) => {
    if (!context.checkUserId(id)) {
      return Promise.resolve(null);
    }
    return simpleResult(dbSchema.Trip.findOneAndUpdate({id: id},
      {'$set': Trip.toMongo(trip)}));
  }),

  removeTrip: ownerProtected(({id}, context) => {
    if (!context.checkUserId(id)) {
      return Promise.resolve(null);
    }
    return simpleResult(dbSchema.Trip.findOneAndRemove({id: id}));
  })
};
