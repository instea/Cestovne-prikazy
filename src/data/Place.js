const moment = require('moment');
const _ = require('lodash');

module.exports.fullToSerializable = (place) => (Object.assign(_.pick(place, ['id', 'name', 'destinationName', 'originName']), {
  travelDuration: place.travelDuration.toISOString()
}));

module.exports.serializableToFull = (place) => (Object.assign(_.pick(place, ['id', 'name', 'destinationName', 'originName']), {
  travelDuration: moment.duration(place.travelDuration)
}));
