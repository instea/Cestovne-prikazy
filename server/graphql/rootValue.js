const uuid = require('uuid');
const moment = require('moment');
const dbSchema = require('../db/schema');
const {userProtected, adminProtected, ownerProtected} = require('../auth/rootResolverDecorators');
const {createJwt, checkCredentials, hashPassword} = require('../auth/operations');

const normalizeTrip = (trip) => ({
   id: trip.id,
   place: trip.place,
   from: moment(trip.from).toISOString(),
   to: moment(trip.to).toISOString()
});

const simpleResult = (resolve, reject) => {
   return (err) => {
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
};

module.exports = {
   getUserInfo: userProtected(({}, context) => new Promise((resolve, reject) => {
      dbSchema.User.findOne({id: context.user.id}, (err, user) => {
         resolve(user);
      });
   })),

   getUser: adminProtected(({id}) => new Promise((resolve, reject) => {
      dbSchema.User.findOne({id: id}, (err, user) => {
         resolve(user);
      });
   })),

   getUsers: adminProtected(({}) => new Promise((resolve, reject) => {
      dbSchema.User.find({}, (err, users) => {
         resolve(users);
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

   getTrip: userProtected(({id}) => new Promise((resolve, reject) => {
      dbSchema.Trip.findOne({id: id}, (err, trip) => {
         if (err) {
            reject();
         }
         resolve(normalizeTrip(trip));
      });
   })),

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

   userPing: ({}, context) => new Promise((resolve, reject) => {
      resolve({
         success: true
      });
   }),

   createTrip: userProtected(({trip}) => new Promise((resolve, reject) => {
      new dbSchema.Trip({
         id: uuid.v4(),
         from: moment(trip.from).toDate(),
         to: moment(trip.to).toDate(),
         place: trip.place
      }).save((err, _trip) => {
         resolve(_trip);
      });
   })),

   updateTrip: userProtected(({id, trip}) => new Promise((resolve, reject) => {
      dbSchema.Trip.findOneAndUpdate({id: id}, {'$set': {
         from: moment(trip.from).toDate(),
         to: moment(trip.to).toDate(),
         place: trip.place
      }}, simpleResult(resolve, reject));
   })),

   removeTrip: userProtected(({id}) => new Promise((resolve, reject) => {
      dbSchema.Trip.findOneAndRemove({id: id}, simpleResult(resolve, reject));
   })),

   createUser: adminProtected(({user}) => new Promise((resolve, reject) => {
      hashPassword(user.password || '', (hash) => {
         new dbSchema.User(Object.assign({}, user, {
            id: uuid.v4(),
            password: hash,
         })).save((err, _user) => {
            resolve(_user);
         });
      });
   })),

   updateUser: adminProtected(({id, user}) => new Promise((resolve, reject) => {
      const updatePassword = !!user.password;
      hashPassword(user.password || '', (hash) => {
         dbSchema.User.findOneAndUpdate({id: id}, {'$set': Object.assign({}, {
            name: user.name,
            isAdmin: user.isAdmin
         }, updatePassword ? {
            password: hash
         } : {})}, simpleResult(resolve, reject));
      });
   })),

   removeUser: adminProtected(({id}) => new Promise((resolve, reject) => {
      dbSchema.User.findOneAndRemove({id: id}, simpleResult(resolve, reject));
   }))
};
