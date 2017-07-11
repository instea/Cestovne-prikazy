const Excel = require('exceljs');
const path = require('path');

module.exports = async () => {

  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '../templates/cestovny-prikaz.xlsx'));

  // TODO - replacement logic
  // TODO - save: why is data lost?

  const filename = path.join(__dirname, '../download', `cestovny-prikaz-${Math.round(Math.random() * 90000000 + 10000000)}.xlsx`);
  await workbook.xlsx.writeFile(filename);

  return filename;

};
