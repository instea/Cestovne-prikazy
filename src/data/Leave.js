const _ = require('lodash');
const { toIso, toMoment, toDate } = require('./dataUtil');

const convert = modifiers => input => {
  const output = _.pick(input, [
    'id',
    'requesterId',
    'approverId',
    'startDate',
    'endDate',
    'type',
    'state',
  ]);
  Object.keys(modifiers).forEach(
    key => (output[key] = modifiers[key](output[key]))
  );
  return output;
};

module.exports.toSerializable = convert({
  startDate: toIso,
  endDate: toIso
});

module.exports.toFull = convert({
  startDate: toMoment,
  endDate: toMoment
});

module.exports.toMongo = convert({
  startDate: toDate,
  endDate: toDate
});
