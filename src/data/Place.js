const moment = require('moment');
const _ = require('lodash');

const convert = (modifiers) => ((input) => {
  const output = _.pick(input, ['id', 'name', 'destinationName', 'originName', 'travelDuration', 'country']);
  Object.keys(modifiers).forEach(key => output[key] = modifiers[key](output[key]));
  return output;
});

module.exports.fullToSerializable = convert({
  travelDuration: (val) => val.toISOString()
});

module.exports.serializableToFull = convert({
  travelDuration: (val) => moment.duration(val)
});
