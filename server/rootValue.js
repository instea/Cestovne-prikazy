const uuid = require('uuid');
const moment = require('moment');
const _ = require('lodash');

// HELPER FUNCTIONS

const date = (dateString) => moment(dateString).toISOString();

const addTrip = (from, to, place) => {
   module.exports.createTrip({
      trip: {
         from: from,
         to: to,
         place: place
      }
   });
};

// IN-MEMORY DATA STORE
const trips = [];

// DEFINITIONS

module.exports = {
   getTrips: () => trips,
   getTrip: ({id}) => _.find(trips, trip => trip.id === id),
   createTrip: ({trip}) => {
      const newTrip = {
         id: uuid.v4(),
         from: date(trip.from),
         to: date(trip.to),
         place: trip.place
      };
      trips.push(newTrip);
      return newTrip;
   },
   updateTrip: ({id, trip}) => {
      const oldTrip = module.exports.getTrip({id: id});
      if (oldTrip) {
         _.assign(oldTrip, trip);
         return oldTrip;
      }
   },
   removeTrip: ({id}) => {
      const indexToRemove = _.findIndex(trips, trip => trip.id === id);
      if (indexToRemove > -1) {
         return trips.splice(indexToRemove, 1)[0];
      }
   }
};

// FILLING DATA STORE WITH DUMMY DATA
addTrip("2017-07-10 12:00", "2017-07-10 13:00", "Bratislava"),
addTrip("2017-07-11 12:00", "2017-07-11 13:00", "Viedeň"),
addTrip("2017-07-12 12:00", "2017-07-12 13:00", "Nitra"),
addTrip("2017-07-13 12:00", "2017-07-13 13:00", "Žilina")
