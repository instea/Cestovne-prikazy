const moment = require('moment');

module.exports.toSerializable = (trip) => ({
  id: trip.id,
  place: trip.place,
  from: moment(trip.from).toISOString(),
  to: moment(trip.to).toISOString()
});

module.exports.toFull = (trip) => ({
  id: trip.id,
  place: trip.place,
  from: moment(trip.from),
  to: moment(trip.to)
});

module.exports.toMongo = (trip) => (Object.assign({
  from: moment(trip.from).toDate(),
  to: moment(trip.to).toDate(),
  place: trip.place
}, trip.id ? {
  id: trip.id
} : {}));
