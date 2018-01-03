const Excel = require('exceljs');
const path = require('path');
const moment = require('moment');
const dbSchema = require('../db/schema');
const _ = require('lodash');
const {compute: computeDiet} = require('../../src/data/Diets');

const setCellValue = (cell, value) => {
  if (/^-?([0-9]+)(\.[0-9]+)?$/.test(value)) {
    cell.value = parseFloat(value);
    cell.numFmt = '0.00';
  } else if (/^[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}$/.test(value)) {
    cell.value = value;
    cell.numFmt = 'dd/mm/yyyy';
  } else {
    cell.value = value;
  }
};

module.exports = async ({userId, month}) => {

  const user = await dbSchema.User.findOne({id: userId});
  const m_month = moment(month, 'YYYY-MM');
  const dateRange = [m_month, m_month.clone().add(1, 'month')];

  const trips = await dbSchema.Trip.find({
    userId: userId,
    departureTime: {
      '$gte': dateRange[0].toDate(),
      '$lt': dateRange[1].toDate()
    }
  });

  const placeIds = trips.map(trip => trip.placeId);
  const places = await dbSchema.Place.find({id: {
    '$in': placeIds
  }});
  const placesById = {};
  places.forEach(place => placesById[place.id] = place);
  await Promise.all(trips.map(async (trip) => {
    trip.place = placesById[trip.placeId];

    const dur = moment.duration(Math.abs(moment(trip.arrivalTime).diff(trip.departureTime)));
    const hours = dur.asHours();
    const country = trip.place.country;
    trip.dietTariff = await computeDiet(country, hours);
    return true;
  }));

  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '../templates/cestovny-prikaz.xlsx'));
  const sheet = workbook.getWorksheet(1);

  // Header
  _.range(1, 5, true).map(rowIndex => sheet.getRow(rowIndex).eachCell((cell) =>
    cell.value = _.template(cell.value)({
      user: user
    })));

  // Left part
  const lcols = ['A', 'C', 'F', 'H'];
  const tplRow = sheet.getRow(8);
  const tplCells = lcols.map(col => tplRow.getCell(col));
  const ltemplates = tplCells.map(cell => {
    const tpl = _.template(cell.value, {
      imports: {
        moment
      }
    });
    cell.value = '';
    return tpl;
  });

  let rowIndex = 8;
  trips.forEach(trip => {

    const row = sheet.getRow(rowIndex);
    const cells = lcols.map(col => row.getCell(col));
    const values = ltemplates.map(tpl => tpl({
      user: user,
      trip: trip
    }));

    _.zip(cells, values).forEach(([cell, value]) => {
      setCellValue(cell, value);
    });

    rowIndex++;
  });

  // Right part
  const rows = [7, 9, 7, 8, 9, 10, 7, 8, 9, 10, 7, 7, 7];
  const rcols = ['J', 'J', 'L', 'L', 'L', 'L', 'M', 'M', 'M', 'M', 'N', 'R', 'S'];
  const getCells = (index) => _.zip(rows.map(row => row + 4 * index), rcols)
    .map(([row, col]) => col + row)
    .map(cellNum => sheet.getCell(cellNum));

  const rtemplates = getCells(0).map(cell => {
    const tpl = _.template(cell.value, {
      imports: {
        moment
      }
    });
    cell.value = '';
    return tpl;
  });

  let index = 0;
  trips.forEach(trip => {

    const cells = getCells(index);
    const values = rtemplates.map(tpl => tpl({
      user: user,
      trip: trip
    }));

    _.zip(cells, values).forEach(([cell, value]) => {
      setCellValue(cell, value);
    });

    index++;
  });

  // Clearing cached formula results (that prevents Excel from performing calculations)
  sheet.eachRow((row) => row.eachCell((cell) => {
    if (cell.type === Excel.ValueType.Formula) {
      cell.value = _.omit(cell.value, 'result');
    }
  }));

  const filename = path.join(__dirname, '../download', `cestovny-prikaz-${Math.round(Math.random() * 90000000 + 10000000)}.xlsx`);
  await workbook.xlsx.writeFile(filename);

  return filename;

};