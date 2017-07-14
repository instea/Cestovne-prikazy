const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected, adminProtected, ownerProtected} = require('../auth/rootResolverDecorators');
const {createJwt, checkCredentials, hashPassword} = require('../auth/operations');
const User = require('../../src/data/User');
const simpleResult = require('./utils').simpleResult;

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

  loginUser: ({user}) => new Promise((resolve, reject) => {
    checkCredentials(user.username, user.password, (err, user) => {
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

  createUser: adminProtected(({user}) => new Promise((resolve, reject) => {
    hashPassword(user.password || '', (hash) => {
      new dbSchema.User(User.create(Object.assign(user, {
        id: uuid.v4()
      }), hash, !!user.isAdmin)).save((err, _user) => {
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
      const userData = User.create(user, updatePassword ? hash : undefined, context.user.isAdmin ? !!user.isAdmin : undefined);
      dbSchema.User.findOneAndUpdate({id: id}, {'$set': userData}, simpleResult(resolve, reject));
    });
  })),

  removeUser: adminProtected(({id}) => new Promise((resolve, reject) => {
    dbSchema.User.findOneAndRemove({id: id}, simpleResult(resolve, reject));
  }))
};
