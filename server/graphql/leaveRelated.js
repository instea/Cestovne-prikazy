const uuid = require('uuid');
const {
  userProtected,
  ownerProtected,
  adminProtected
} = require('../auth/rootResolverDecorators');
const dbSchema = require('../db/schema');
const { getUserOrDefault } = require('../service/userService');
const { getLeave } = require('../service/leaveService');
const Leave = require('../../src/data/Leave');
const { simpleResult } = require('./utils');
const { LEAVE_STATE_CODES } = require('../../src/data/LeaveState');
const { sendPendingLeaveMail } = require('../service/mailService');

const genId = () => uuid.v4();

module.exports = {
  getLeaves: userProtected(() =>
    dbSchema.Leave.find({}).then(trips => trips.map(toGQL))
  ),
  createLeave: userProtected((params, context) => {
    const { leave } = params;
    leave.id = genId();
    leave.requesterId = context.user.id;
    leave.state = LEAVE_STATE_CODES.PENDING;
    const entity = new dbSchema.Leave(Leave.toMongo(leave));
    return entity.save().then(leave => {
      sendPendingLeaveMail(leave);
      return toGQL(leave);
    });
  }),
  removeLeave: ownerProtected(async (params, context) => {
    const { id } = params;
    const leave = await getLeave(id);
    if (!leave || !context.checkUserId(leave.requesterId)) {
      return Promise.resolve(null);
    }
    return simpleResult(dbSchema.Leave.findOneAndRemove({ id: id }));
  }),
  approveLeave: adminProtected(function approveLeave(params, context) {
    const { id } = params;
    const { id: approverId } = context.user;
    const update = { $set: { state: LEAVE_STATE_CODES.APPROVED, approverId } };
    return dbSchema.Leave
      .findOneAndUpdate({ id }, update, { new: true })
      .then(toGQL);
  }),
  rejectLeave: adminProtected(function rejectLeave(params, context) {
    const { id } = params;
    const { id: approverId } = context.user;
    const update = { $set: { state: LEAVE_STATE_CODES.REJECTED, approverId } };
    return dbSchema.Leave
      .findOneAndUpdate({ id }, update, { new: true })
      .then(toGQL);
  }),
};

function toGQL(leave) {
  leave = Leave.toSerializable(leave);
  leave.requester = () => getUserOrDefault(leave.requesterId);
  leave.approver = () => getUserOrDefault(leave.approverId);
  return leave;
}
