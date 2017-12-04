const { toIso } = require('../../src/data/dataUtil');

const mockDate = day => toIso(new Date(Date.now() + day * 24 * 3600 * 1000));

module.exports = {
  getLeaves: () => [
    { id: '1', startDate: mockDate(-10), endDate: mockDate(-2) },
    { id: '2', startDate: mockDate(5), endDate: mockDate(10) }
  ]
};
