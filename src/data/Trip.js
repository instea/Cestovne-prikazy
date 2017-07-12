const moment = require('moment');
const _ = require('lodash');

const convert = (modifiers) => ((input) => {
  const output = _.pick(input, ['id', 'userId', 'placeId', 'departureTime', 'arrivalTime',
    'purpose', 'travelType', 'priceOfTravel']);
  Object.keys(modifiers).forEach(key => output[key] = modifiers[key](output[key]));
  return output;
});

const toIso = (val) => moment(val).toISOString();
const toMoment = (val) => moment(val);
const toDate = (val) => moment(val).toDate();

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
