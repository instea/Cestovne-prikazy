const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected, adminProtected, ownerProtected} = require('../auth/rootResolverDecorators');
const {createJwt, checkCredentials, hashPassword} = require('../auth/operations');
const User = require('../../src/data/User');
const simpleResult = require('./utils').simpleResult;

module.exports = {
  getUserInfo: userProtected((_, context) => dbSchema.User.findOne({id: context.user.id})),

  getUser: userProtected(({id}) => {
    return dbSchema.User.findOne({id: id});
  }),

  getUsers: userProtected(() => dbSchema.User.find({})),

  loginUser: ({user}) => checkCredentials(user.username, user.password).then((user) => ({
    success: true,
    payload: createJwt(user).compact()
  })).catch((err) => ({
    success: false,
    message: err
  })),

  createUser: adminProtected(({user}) => hashPassword(user.password || '').then((hash) => {
    return new dbSchema.User(User.create(Object.assign(user, {
      id: uuid.v4()
    }), hash, !!user.isAdmin)).save();
  })),

  updateUser: ownerProtected(({id, user}, context) => {
    if (!context.checkUserId) {
      return Promise.resolve({
        success: false,
        message: 'Not authorized'
      });
    }
    const updatePassword = !!user.password;
    return hashPassword(user.password || '').then((hash) => {
      const userData = User.create(user, updatePassword ? hash : undefined, context.user.isAdmin ? !!user.isAdmin : undefined);
      return simpleResult(dbSchema.User.findOneAndUpdate({id: id}, {'$set': userData}));
    });
  }),

  removeUser: adminProtected(({id}) => simpleResult(dbSchema.User.findOneAndRemove({id: id})))
};
