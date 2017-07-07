const uuid = require('uuid');
const moment = require('moment');
const schema = require('../db/schema');

module.exports = {
   getTrips: () => new Promise((resolve, reject) => {
      schema.Trip.find({}, (err, trips) => {
         if (err) {
            reject();
         }
         resolve(trips);
      });
   }),

   getTrip: ({id}) => new Promise((resolve, reject) => {
      schema.Trip.findOne({id: id}, (err, trip) => {
         if (err) {
            reject();
         }
         resolve(trip);
      });
   }),

   createTrip: ({trip}) => new Promise((resolve, reject) => {
      new schema.Trip({
         id: uuid.v4(),
         from: moment(trip.from).toDate(),
         to: moment(trip.to).toDate(),
         place: trip.place
      }).save((err, _trip) => {
         if (err) {
            reject();
         }
         resolve(_trip);
      });
   }),

   updateTrip: ({id, trip}) => new Promise((resolve, reject) => {
      schema.Trip.findOneAndUpdate({id: id}, {'$set': trip}, (err, _trip) => {
         if (err) {
            reject();
         }
         resolve(_trip);
      });
   }),

   removeTrip: ({id}) => new Promise((resolve, reject) => {
      schema.Trip.findOneAndRemove({id: id}, (err, trip) => {
         if (err) {
            reject();
         }
         resolve(trip);
      });
   })
};
