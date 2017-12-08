const {
  userProtected,
  adminProtected
} = require('../auth/rootResolverDecorators');
const { getUser } = require('../service/userService');

let seqNr = 1;
const genId = () => '' + seqNr++;
const leaves = [];

module.exports = {
  getLeaves: () => leaves.map(toGQL),
  createLeave: userProtected((params, context) => {
    const { leave } = params;
    leave.id = genId();
    leave.requesterId = context.user.id;
    leaves.push(leave);
    return leave;
  }),
  // TODO
  approveLeave: adminProtected(() => null)
};

function toGQL(leave) {
  leave.requester = () => getUser(leave.requesterId);
  return leave;
}
