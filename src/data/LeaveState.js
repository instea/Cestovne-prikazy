const CODES = {
  'PENDING': 'PENDING',
  'APPROVED':'APPROVED',
  'REJECTED':'REJECTED',
};

// keep in sync with angular enum
module.exports.LEAVE_STATES = [
  {code: CODES.PENDING, label: 'PENDING'},
  {code: CODES.APPROVED, label: 'APPROVED'},
  {code: CODES.REJECTED, label: 'REJECTED'},
];

module.exports.LEAVE_STATE_CODES = CODES;
