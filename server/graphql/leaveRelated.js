const uuid = require('uuid');
const {
  userProtected,
  adminProtected
} = require('../auth/rootResolverDecorators');
const dbSchema = require('../db/schema');
const { getUser } = require('../service/userService');
const Leave = require('../../src/data/Leave');

const genId = () => uuid.v4();

module.exports = {
  getLeaves: userProtected(() =>
    dbSchema.Leave.find({}).then(trips => trips.map(toGQL))
  ),
  createLeave: userProtected((params, context) => {
    const { leave } = params;
    leave.id = genId();
    leave.requesterId = context.user.id;
    const entity = new dbSchema.Leave(Leave.toMongo(leave));
    return entity.save().then(toGQL);
  }),
  // TODO
  approveLeave: adminProtected(() => null)
};

function toGQL(leave) {
  leave = Leave.toSerializable(leave);
  leave.requester = () => getUser(leave.requesterId);
  return leave;
}
