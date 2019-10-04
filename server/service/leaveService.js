const _ = require('lodash');
const dbSchema = require('../db/schema');
const { enumarateWorkingDays } = require('./tripService');
const { getUserByEmail } = require('./userService');

const getLeave = id => dbSchema.Leave.findOne({ id });

const findUserLeavesForRange = (userId, range) => {
  const [from, to] = range;
  return dbSchema.Leave.find({
    requesterId: userId,
    startDate: {
      $lte: to
    },
    endDate: {
      $gte: from
    }
  });
};

const findUserLeavesForRangeByEmail = async (email, range) => {
  const [from, to] = range;
  const user = await getUserByEmail(email);
  return (user && user !== null) ? dbSchema.Leave.find({
    requesterId: user.id,
    startDate: {
      $lte: to
    },
    endDate: {
      $gte: from
    }
  }) : [];
};

function enumarateLeavesWorkingDays(leaves) {
  console.log('enumarateLeavesWorkingDays', leaves);
  let days = _.flatten(
    leaves.map(t => enumarateWorkingDays(t.startDate, t.endDate))
  );
  return _.sortBy(_.uniq(days));
}

module.exports = {
  getLeave,
  findUserLeavesForRange,
  enumarateLeavesWorkingDays,
  findUserLeavesForRangeByEmail
};
