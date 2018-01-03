const dbSchema = require('../db/schema');
const moment = require('moment');
const _ = require('lodash');
const Holidays = require('date-holidays');
const hd = new Holidays('SK');

// range : [from: date incl, to: date excl]
const findUserTripsForRange = (userId, range) =>
  dbSchema.Trip.find({
    userId: userId,
    departureTime: {
      $gte: range[0],
      $lt: range[1]
    }
  });

const computeTripDuration = trip =>
  moment.duration(Math.abs(moment(trip.arrivalTime).diff(trip.departureTime)));

const fromDate = date => moment(date).format('YYYY-MM-DD');

const enumarateTripsWorkingDays = trips => {
  console.log('enumarateTripsWorkingDays', trips);
  let days = _.flatten(
    trips.map(t => enumarateWorkingDays(t.departureTime, t.arrivalTime))
  );
  return _.sortBy(_.uniq(days));
};

function enumarateWorkingDays(from, to) {
  const days = enumarateDays(from, to);
  return days.filter(isWorking);
}

function ensureDateRange(dateStr, range) {
  return moment
    .min(moment(range[1]), moment.max(moment(range[0]), moment(dateStr)))
    .format('YYYY-MM-DD');
}

function isWorking(str) {
  const date = new Date(str);
  const day = date.getDay();
  return !hd.isHoliday(date) && day !== 0 && day !== 6;
}

function enumarateDays(from, to) {
  const days = [];
  const m = moment(from);
  while (m.toDate() < to) {
    days.push(fromDate(m));
    m.add(1, 'day');
  }
  days.push(fromDate(to));
  return _.uniq(days);
}

module.exports = {
  findUserTripsForRange,
  computeTripDuration,
  enumarateTripsWorkingDays,
  enumarateWorkingDays,
  ensureDateRange
};
