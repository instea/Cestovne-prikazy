const cc = require('currency-converter')({
  fetchInterval: 3600000,
  CLIENTKEY: 'e6e6f24371ee45a98a885792643cfed4'
});

const bluebirdToPromise = (blPromise) => {
  return new Promise((resolve, reject) => blPromise.then(resolve).catch(reject));
};

const sk = (hours) => {
  if (hours >= 5 && hours <= 12) {
    return 4.5;
  } else if (hours <= 18) {
    return 6.7;
  } else if (hours > 18) {
    return 10.3;
  }
};

const foreign = (basicTariff, hours) => {
  if (hours <= 6) {
    return basicTariff * 0.25;
  } else if (hours <= 12) {
    return basicTariff * 0.5;
  } else {
    return basicTariff;
  }
};

const inCurrency = (basicTariff, currency) => ((hours) => {
  return bluebirdToPromise(cc.convert(basicTariff, currency, 'EUR'))
    .then(inEur => foreign(inEur.amount, hours));
});

const DEFAULT_DIET = 0;
// http://www.noveaspi.sk/products/lawText/1/75745/1/2#xml=http://www.zbierka.sk/zz/predpisy/default.aspx?HitFile=True&FileID=485&Flags=160&IndexFile=zz2011&Text=základné+sadzby+stravného+v+eurách
const DIETS = {
  SK: sk,
  AF: 32,
  AL: 33,
  DZ: inCurrency(42, 'USD'),
  AD: 42,
  AO: 40,
  AI: inCurrency(50, 'USD'),
  AG: inCurrency(52, 'USD'),
  AR: 37,
  AM: inCurrency(35, 'USD'),
  AW: inCurrency(33, 'USD'),
  AU: inCurrency(74, 'AUD'),
  AZ: inCurrency(36, 'USD'),
  BS: inCurrency(47, 'USD'),
  BH: 39,
  BD: 36,
  BB: inCurrency(54, 'USD'),
  BE: 45,
  BZ: inCurrency(45, 'USD'),
  BJ: inCurrency(47, 'USD'),
  BM: inCurrency(51, 'USD'),
  BT: 30,
  BY: 39,
  BO: 32,
  BA: 40,
  BW: 33,
  BR: 40,
  BN: 27,
  BG: 36,
  BF: 36,
  BI: 43,
  CW: inCurrency(40, 'USD'),
  CY: 41,
  TD: 39,
  CZ: inCurrency(600, 'CZK'),
  CL: 37,
  ME: 40,
  CN: 38,
  DK: inCurrency(380, 'DKK'),
  DM: inCurrency(41, 'USD'),
  DO: inCurrency(50, 'USD'),
  DJ: 38,
  EG: 40,
  EC: 45,
  ER: 38,
  EE: 42,
  ET: 39,
  FJ: inCurrency(55, 'AUD'),
  PH: 31,
  FI: 50,
  FR: 45,
  PF: 42,
  GA: 45,
  GM: inCurrency(33, 'USD'),
  GH: inCurrency(55, 'USD'),
  GI: 40,
  GR: 42,
  GD: inCurrency(46, 'USD'),
  GE: inCurrency(37, 'USD'),
  GP: 38,
  GT: inCurrency(38, 'USD'),
  GN: inCurrency(43, 'USD'),
  GW: inCurrency(46, 'USD'),
  GY: 38,
  HT: inCurrency(55, 'USD'),
  NL: 45,
  HN: inCurrency(38, 'USD'),
  HK: 40,
  HR: 40,
  IN: 38,
  ID: 42,
  IQ: 35,
  IR: 37,
  IE: 53,
  IS: 55,
  IL: 48,
  JM: inCurrency(56, 'USD'),
  JP: inCurrency(6500, 'JPY'),
  YE: 35,
  JO: 36,
  ZA: 38,
  KH: 29,
  CM: 38,
  CA: inCurrency(65, 'CAD'),
  CV: inCurrency(38, 'USD'),
  QA: 35,
  KZ: 45,
  KE: 45,
  KG: 37,
  CO: 39,
  KM: inCurrency(35, 'USD'),
  CD: inCurrency(60, 'USD'),
  CG: inCurrency(55, 'USD'),
  KP: 34,
  KR: 40,
  CR: inCurrency(45, 'USD'),
  CU: 45,
  KW: 38,
  LA: 34,
  LS: 32,
  LB: 37,
  LR: inCurrency(55, 'USD'),
  LY: 45,
  LI: inCurrency(80, 'CHF'),
  LT: 40,
  LV: 40,
  LU: 50,
  MO: 59,
  MK: 37,
  MG: 31,
  HU: 39,
  MY: 32,
  MW: 34,
  MV: 41,
  ML: inCurrency(46, 'USD'),
  MT: 45,
  MA: inCurrency(35, 'USD'),
  MQ: 25,
  MU: 34,
  MR: 30,
  MX: 35,
  MM: 41,
  MD: 40,
  MC: 45,
  MN: 40,
  MZ: 35,
  NA: 31,
  DE: 45,
  NP: 36,
  NE: inCurrency(42, 'USD'),
  NG: 47,
  NI: inCurrency(44, 'USD'),
  NO: inCurrency(420, 'NOK'),
  NZ: inCurrency(48, 'USD'),
  OM: 38,
  PK: 35,
  PA: inCurrency(42, 'USD'),
  PG: 30,
  PY: 31,
  PE: 40,
  CI: 38,
  PL: 37,
  PR: inCurrency(35, 'USD'),
  PT: 43,
  AT: 45,
  GQ: inCurrency(45, 'USD'),
  RO: 43,
  RU: 39,
  RW: 41,
  SV: inCurrency(40, 'USD'),
  WS: inCurrency(36, 'USD'),
  SM: 45,
  SA: 36,
  SN: inCurrency(41, 'USD'),
  SC: 35,
  SL: inCurrency(48, 'USD'),
  SG: 35,
  SI: 38,
  SO: 32,
  AE: 35,
  GB: inCurrency(37, 'GBP'),
  US: inCurrency(60, 'USD'),
  RS: 43,
  LK: 37,
  CF: inCurrency(31, 'USD'),
  SD: 42,
  SR: 42,
  SZ: 29,
  LC: inCurrency(40, 'USD'),
  KN: inCurrency(57, 'USD'),
  ST: inCurrency(37, 'USD'),
  SY: 30,
  ES: 43,
  CH: inCurrency(80, 'CHF'),
  SE: inCurrency(455, 'SEK'),
  TJ: 32,
  TW: 40,
  IT: 45,
  TZ: 42,
  TH: 31,
  TG: 36,
  TT: inCurrency(56, 'USD'),
  TN: 37,
  TR: 44,
  TM: 33,
  UG: 42,
  UA: 37,
  UY: 37,
  UZ: 39,
  VA: 45,
  VE: 46,
  VN: 35,
  ZM: 33,
  ZW: 39
};

module.exports.compute = function (countryCode, hours) {
  const diet = DIETS[countryCode];
  let ret = foreign(DEFAULT_DIET, hours);
  
  if (typeof diet === 'function') {
    ret = diet(hours);
  }

  if (typeof diet === 'number') {
    ret = foreign(diet, hours);
  }

  if (typeof ret === 'number') {
    return Promise.resolve(ret);
  }
  return ret;

};