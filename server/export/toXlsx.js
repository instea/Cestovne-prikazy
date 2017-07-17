const Excel = require('exceljs');
const path = require('path');
const moment = require('moment');

module.exports = async ({userId, month}) => {

  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '../templates/cestovny-prikaz.xlsx'));

  console.log(moment(month, 'YYYY-MM').toString());

  // TODO - replacement logic

  const filename = path.join(__dirname, '../download', `cestovny-prikaz-${Math.round(Math.random() * 90000000 + 10000000)}.xlsx`);
  await workbook.xlsx.writeFile(filename);

  return filename;

};
