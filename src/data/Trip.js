const _ = require('lodash');
const { toIso, toMoment, toDate } = require('./dataUtil');

const convert = (modifiers) => ((input) => {
  const output = _.pick(input, ['id', 'userId', 'placeId', 'departureTime', 'arrivalTime',
    'purpose', 'travelType', 'priceOfTravel']);
  Object.keys(modifiers).forEach(key => output[key] = modifiers[key](output[key]));
  return output;
});

module.exports.toSerializable = convert({
  departureTime: toIso,
  arrivalTime: toIso
});

module.exports.toFull = convert({
  departureTime: toMoment,
  arrivalTime: toMoment
});

module.exports.toMongo = convert({
  departureTime: toDate,
  arrivalTime: toDate
});
