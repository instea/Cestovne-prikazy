const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected, adminProtected} = require('../auth/rootResolverDecorators');
const simpleResult = require('./utils').simpleResult;

module.exports = {
  getPlaces: userProtected(() => dbSchema.Place.find({})),

  getPlace: userProtected(({id}) => dbSchema.Place.findOne({id: id})),

  createPlace: adminProtected(({place}) => (new dbSchema.Place(Object.assign(place, {
    id: uuid.v4()
  })).save())),

  updatePlace: adminProtected(({id, place}) => simpleResult(dbSchema.Place.findOneAndUpdate({id: id}, {'$set': place}))),

  removePlace: adminProtected(({id}) => simpleResult(dbSchema.Place.findOneAndRemove({id: id})))
};
