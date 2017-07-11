const XLSX = require('xlsx');
const path = require('path');

module.exports = async () => {

  const workbook = XLSX.readFile(path.join(__dirname, '../templates/cestovny-prikaz.xlsx'));
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const filename = path.join(__dirname, '../download', `cestovny-prikaz-${Math.round(Math.random() * 90000000 + 10000000)}.xlsx`);

  const writePromise = new Promise((resolve, reject) => {
    XLSX.writeFileAsync(filename, workbook, () => {
      resolve();
    });
  });
  try {
    await writePromise;
  } catch (e) {
    console.error(e);
    return null;
  }

  return filename;

};
