const uuid = require('uuid');
const moment = require('moment');
const dbSchema = require('../db/schema');
const {userProtected, adminProtected, ownerProtected} = require('../auth/rootResolverDecorators');
const {createJwt, checkCredentials, hashPassword} = require('../auth/operations');
const Trip = require('../../src/data/Trip');

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
  getUserInfo: userProtected((_, context) => new Promise((resolve, reject) => {
    dbSchema.User.findOne({id: context.user.id}, (err, user) => {
      resolve(user);
    });
  })),

  getUser: ownerProtected(({id}, context) => new Promise((resolve, reject) => {
    if (!context.checkUserId(id)) {
      return resolve(null);
    }
    dbSchema.User.findOne({id: id}, (err, user) => {
      resolve(user);
    });
  })),

  getUsers: adminProtected(() => new Promise((resolve, reject) => {
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
        payload: createJwt(user).compact()
      });
    });
  }),

  userPing: () => new Promise((resolve, reject) => {
    resolve({
      success: true
    });
  }),

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

  updateUser: ownerProtected(({id, user}, context) => new Promise((resolve, reject) => {
    if (!context.checkUserId) {
      return resolve({
        success: false,
        message: 'Not authorized'
      });
    }

    const updatePassword = !!user.password;
    hashPassword(user.password || '', (hash) => {
      dbSchema.User.findOneAndUpdate({id: id}, {'$set': Object.assign({}, {
        name: user.name
      }, context.user.isAdmin ? {
        isAdmin: user.isAdmin
      } : {}, updatePassword ? {
        password: hash
      } : {})}, simpleResult(resolve, reject));
    });
  })),

  removeUser: adminProtected(({id}) => new Promise((resolve, reject) => {
    dbSchema.User.findOneAndRemove({id: id}, simpleResult(resolve, reject));
  }))
};
