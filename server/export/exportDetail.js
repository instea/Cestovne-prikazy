const Excel = require('exceljs');
const path = require('path');
const moment = require('moment');
const _ = require('lodash');
const { getUser } = require('../service/userService');
const {
  findUserTripsForRange,
  isDayOfMonth,
  enumarateTripsWorkingDays,
  enumarateWorkingDays
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

  const isThisMonth = d => isDayOfMonth(d, month);
  const trips = await findUserTripsForRange(userId, dateRange);
  const tripDays = enumarateTripsWorkingDays(trips).filter(isThisMonth);

  const leaves = await findUserLeavesForRange(userId, dateRange);
  const leavesDays = enumarateLeavesWorkingDays(leaves).filter(isThisMonth);

  const monthDays = enumarateWorkingDays(dateRange[0], dateRange[1]);
  const expectedTickets = _.difference(
    _.difference(monthDays, tripDays),
    leavesDays
  );

  const workbook = new Excel.Workbook();
  // await workbook.xlsx.readFile(path.join(__dirname, '../templates/detail.xlsx'));
  // const sheet = workbook.getWorksheet('Detail');
  const sheet = workbook.addWorksheet('Detail');

  sheet.getCell('A1').value = user.firstName + ' ' + user.surname;
  sheet.getCell('B1').value = month;

  sheet.getCell('A3').value = 'Trips';
  sheet.getCell('B3').value = tripDays.length;
  sheet.getCell('C3').value = tripDays.join(', ');

  sheet.getCell('A4').value = 'Leaves';
  sheet.getCell('B4').value = leavesDays.length;
  sheet.getCell('C4').value = leavesDays.join(', ');

  sheet.getCell('A6').value = 'Expected tickets';
  sheet.getCell('B6').value = expectedTickets.length;

  const filename = path.join(
    __dirname,
    '../download',
    `detail-${Math.round(Math.random() * 90000000 + 10000000)}.xlsx`
  );
  await workbook.xlsx.writeFile(filename);
  console.log('file written to', filename);

  return filename;
};
