const uuid = require('uuid');
const moment = require('moment');
const dbSchema = require('../db/schema');
const {userProtected, adminProtected, ownerProtected} = require('../auth/rootResolverDecorators');
const {createJwt, checkCredentials} = require('../auth/operations');

const normalizeTrip = (trip) => ({
   id: trip.id,
   place: trip.place,
   from: moment(trip.from).toISOString(),
   to: moment(trip.to).toISOString()
});

const simpleResult = (err) => {
   if (err) {
      return resolve({
         success: false,
         message: err.message
      });
   }
   resolve({
      success: true
   });
};

module.exports = {
   getUser: userProtected(({}, context) => new Promise((resolve, reject) => {
      dbSchema.User.findOne({id: context.user.id}, (err, user) => {
         resolve(user);
      });
   })),

   getTrips: userProtected(() => new Promise((resolve, reject) => {
      dbSchema.Trip.find({}, (err, trips) => {
         if (err) {
            reject();
         }
         resolve(trips.map(normalizeTrip));
      });
   })),

   getTrip: ({id}) => new Promise((resolve, reject) => {
      dbSchema.Trip.findOne({id: id}, (err, trip) => {
         if (err) {
            reject();
         }
         resolve(normalizeTrip(trip));
      });
   }),

   loginUser: ({user}) => new Promise((resolve, reject) => {
      checkCredentials(user.name, user.password, (err, user) => {
         if (err || !user) {
            return resolve({
               success: false,
               message: err
            });
         }
         resolve({
            success: true,
            payload: createJwt(user)
         });
      });
   }),

   createTrip: ({trip}) => new Promise((resolve, reject) => {
      new dbSchema.Trip({
         id: uuid.v4(),
         from: moment(trip.from).toDate(),
         to: moment(trip.to).toDate(),
         place: trip.place
      }).save((err, _trip) => {
         resolve(_trip);
      });
   }),

   updateTrip: ({id, trip}) => new Promise((resolve, reject) => {
      dbSchema.Trip.findOneAndUpdate({id: id}, {'$set': trip}, simpleResult);
   }),

   removeTrip: ({id}) => new Promise((resolve, reject) => {
      dbSchema.Trip.findOneAndRemove({id: id}, simpleResult);
   })
};
