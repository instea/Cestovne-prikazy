const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected} = require('../auth/rootResolverDecorators');
const simpleResult = require('./utils').simpleResult;

module.exports = {
  getPlaces: userProtected(() => new Promise((resolve, reject) => {
    dbSchema.Place.find({}, (err, places) => {
      if (err) {
        reject();
      }
      resolve(places);
    });
  })),

  getPlace: userProtected(({id}) => new Promise((resolve, reject) => {
    dbSchema.Place.findOne({id: id}, (err, place) => {
      if (err) {
        reject();
      }
      resolve(place);
    });
  })),

  createPlace: userProtected(({place}) => new Promise((resolve, reject) => {
    new dbSchema.Place(Object.assign(place, {
      id: uuid.v4()
    })).save((err, _place) => {
      resolve(_place);
    });
  })),

  updatePlace: userProtected(({id, place}) => new Promise((resolve, reject) => {
    dbSchema.Place.findOneAndUpdate({id: id}, {'$set': place}, simpleResult(resolve, reject));
  })),

  removePlace: userProtected(({id}) => new Promise((resolve, reject) => {
    dbSchema.Place.findOneAndRemove({id: id}, simpleResult(resolve, reject));
  }))
};
