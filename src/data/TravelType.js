module.exports.values = [
  {code: 'O', label: 'Osobný vlak'},
  {code: 'R', label: 'Rýchlik'},
  {code: 'A', label: 'Autobus'},
  {code: 'L', label: 'Lietadlo'},
  {code: 'DZ', label: 'Doprava zabezpečená'},
  {code: 'AUS', label: 'Auto služobné'},
  {code: 'AUV', label: 'Auto vlastné'},
  {code: 'MOS', label: 'Motocykel služobný'},
  {code: 'MOV', label: 'Motocykel vlastný'}
];

const byCode = {};
module.exports.values.forEach(val => {
  byCode[val.code] = val.label;
});
module.exports.byCode = byCode;
