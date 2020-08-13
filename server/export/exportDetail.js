const Excel = require('exceljs');
const path = require('path');
const moment = require('moment');
const _ = require('lodash');
const { getUser } = require('../service/userService');
const {
  findUserTripsForRange,
  enumarateTripsWorkingDays,
  enumarateWorkingDays,
  ensureDateRange
} = require('../service/tripService');
const {
  findUserLeavesForRange,
  enumarateLeavesWorkingDays
} = require('../service/leaveService');

module.exports = async ({ userId, month }) => {
  console.log('export to detail', userId, month);

  const user = await getUser(userId);
  const m_month = moment(month, 'YYYY-MM');
  const dateRange = [
    m_month.toDate(),
    m_month
      .clone()
      .add(1, 'month')
      .toDate()
  ];

  const ensureMonth = date => ensureDateRange(date, dateRange);

  const trips = await findUserTripsForRange(userId, dateRange);
  trips.forEach(trip => {
    trip.departureTime = ensureMonth(trip.departureTime);
    trip.arrivalTime = ensureMonth(trip.arrivalTime);
  });
  const tripDays = enumarateTripsWorkingDays(trips);

  const leaves = await findUserLeavesForRange(userId, dateRange);
  leaves.forEach(leave => {
    leave.startDate = ensureMonth(leave.startDate);
    leave.endDate = ensureMonth(leave.endDate);
  });
  const leavesDays = enumarateLeavesWorkingDays(leaves);
  const halfDays = leaves.filter(({ isHalfDay }) => isHalfDay).length / 2;
  const leavesCount = leavesDays.length - halfDays;

  const monthDays = enumarateWorkingDays(dateRange[0], dateRange[1]);
  const expectedMealVouchers = _.difference(
    _.difference(monthDays, tripDays),
    leavesDays
  ).length + halfDays;

  const workbook = new Excel.Workbook();
  const sheet = workbook.addWorksheet('Detail');

  sheet.getColumn('A').width = 18;
  sheet.getColumn('C').width = 18;
  sheet.getColumn('E').width = 25;

  sheet.getCell('A1').value = user.firstName + ' ' + user.surname;
  sheet.getCell('B1').value = 'Month: ';
  sheet.getCell('C1').value = moment(month, 'YYYY-MM').format('MMMM YYYY');

  sheet.getCell('A3').value = 'Trips: ';
  sheet.getCell('B3').value = tripDays.length;
  sheet.getCell('C3').value = 'Leaves: ';
  sheet.getCell('D3').value = leavesCount;
  sheet.getCell('E3').value = 'Expected meal vouchers: ';
  sheet.getCell('F3').value = expectedMealVouchers;

  // Let's use Excel native dates to allow for user preferred formatting
  const toXlsxDateValue = dayString =>
    moment(dayString)
      .hours(12)
      .toDate();

  let i = 4;
  tripDays
    .map(toXlsxDateValue)
    .forEach(day => (sheet.getCell(`A${i++}`).value = day));

  let j = 4;
  leavesDays.forEach(day => {
    const idx = j++;
    let {type, isHalfDay} = getLeaveType(leaves, day);
    
    sheet.getCell(`C${idx}`).value = toXlsxDateValue(day);
    sheet.getCell(`D${idx}`).value = type;
    
    if(isHalfDay) {
      sheet.getCell(`E${idx}`).value = 'HALF DAY';
    }
  });

  const filename = path.join(
    __dirname,
    '../download',
    `detail-${user.firstName}-${user.surname}-${month}-${Math.round(
      Math.random() * 90000000 + 10000000
    )}.xlsx`
  );
  await workbook.xlsx.writeFile(filename);
  console.log('file written to', filename);

  return filename;
};

function getLeaveType(leaves, day) {
  leaves = leaves.filter(l =>
    moment(day).isBetween(l.startDate, l.endDate, 'days', '[]')
  );
  return {
    type: _.uniqBy(leaves.map(l => l.type)).join(' '),
    isHalfDay: _.uniqBy(leaves.map(l => l.isHalfDay))[0]
  } 
}
