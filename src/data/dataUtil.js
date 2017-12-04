const moment = require('moment');

module.exports.toIso = (val) => moment(val).toISOString();
module.exports.toMoment = (val) => moment(val);
module.exports.toDate = (val) => moment(val).toDate();
