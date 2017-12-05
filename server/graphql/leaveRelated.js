const { toIso } = require('../../src/data/dataUtil');

const mockDate = day => toIso(new Date(Date.now() + day * 24 * 3600 * 1000));

let seqNr = 1;
const genId = () => '' + seqNr++;
const leaves = [
  { id: genId(), startDate: mockDate(-10), endDate: mockDate(-2) },
  { id: genId(), startDate: mockDate(5), endDate: mockDate(10) }
];

module.exports = {
  getLeaves: () => leaves,
  createLeave: params => {
    const { leave } = params;
    leave.id = genId();
    leaves.push(leave);
    return leave;
  }
};
