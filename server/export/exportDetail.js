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
  
  const ensureMonth = (date) => ensureDateRange(date, dateRange);

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

  const monthDays = enumarateWorkingDays(dateRange[0], dateRange[1]);
  const expectedMealVouchers = _.difference(
    _.difference(monthDays, tripDays),
    leavesDays
  );

  const workbook = new Excel.Workbook();
  const sheet = workbook.addWorksheet('Detail');

  sheet.getColumn('A').width = 18;
  sheet.getColumn('C').width = 18;
  sheet.getColumn('E').width = 25;

  sheet.getCell('A1').value = user.firstName + ' ' + user.surname;
  sheet.getCell('B1').value = 'Month: ';
  sheet.getCell('C1').value = moment(month, 'YYYY-MM').format('MMMM YYYY');

  sheet.getCell('A3').value = 'Trips: ' + tripDays.length;
  sheet.getCell('C3').value = 'Leaves: ' + leavesDays.length;
  sheet.getCell('E3').value = 'Expected meal vouchers: ' + expectedMealVouchers.length;

  // Let's use Excel native dates to allow for user preferred formatting
  const toXlsxDateValue = (dayString) => moment(dayString).hours(12).toDate();

  let i = 4;
  tripDays.map(toXlsxDateValue).forEach(day => sheet.getCell(`A${i++}`).value = day);

  let j = 4;
  leavesDays.map(toXlsxDateValue).forEach(day => sheet.getCell(`C${j++}`).value = day);

  const filename = path.join(
    __dirname,
    '../download',
    `detail-${Math.round(Math.random() * 90000000 + 10000000)}.xlsx`
  );
  await workbook.xlsx.writeFile(filename);
  console.log('file written to', filename);

  return filename;
};
