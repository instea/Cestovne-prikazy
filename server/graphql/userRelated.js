const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected, adminProtected, ownerProtected} = require('../auth/rootResolverDecorators');
const {createJwt, checkCredentials, hashPassword} = require('../auth/operations');
const {getUser} = require('../service/userService');
const User = require('../../src/data/User');
const simpleResult = require('./utils').simpleResult;
const {OAuth2Client} = require('google-auth-library');
const { LoginResults } = require('../../src/data/LoginResults');

const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);
const hostedDomain = process.env.HOSTED_DOMAIN;

module.exports = {
	getUserInfo: userProtected((_, context) => getUser(context.user.id)),

	getUser: userProtected(({id}) => getUser(id)),

	getUsers: userProtected(() => dbSchema.User.find({})),

	loginUser: ({token_id}) => {
		return client.verifyIdToken({
			idToken: token_id,
			audience: CLIENT_ID
		}).then((ticket) => {
			const payload = ticket.getPayload();
			const userid = payload.sub;
			const domain = payload.hd;

			if (hostedDomain && hostedDomain !== domain) {
				return {
					status: LoginResults.WRONG_DOMAIN
				}
			}
			return getUser(userid)
				.then(user => {
					if (user.approved) {
						return {
							status: LoginResults.SUCCESS,
							jwt: createJwt(user).compact()
						}
					} else {
						return {
							status: LoginResults.NEED_APPROVAL
						}
					}
				})
				.catch(() => {
					new dbSchema.User(User.create(Object.assign({
						id: userid,
						firstName: payload.given_name,
						surname: payload.family_name,
						degrees: '',
						address: '',
						email: payload.email,
						approved: false
					}, {}),false)).save();
					return {
						status: LoginResults.NEED_APPROVAL
					}
				})
		}).catch(() => {
			return {
				status: LoginResults.FAILED
			}
		});
	},

	updateUser: ownerProtected(({id, user}, context) => {
		if (!context.checkUserId) {
			return Promise.resolve({
				success: false,
				message: 'Not authorized'
			});
		}
		const userData = User.create(user,context.user.isAdmin ? !!user.isAdmin : undefined);
		return simpleResult(dbSchema.User.findOneAndUpdate({id: id}, {'$set': userData}));
		}),

	removeUser: adminProtected(({id}) => simpleResult(dbSchema.User.findOneAndRemove({id: id}))),
	approveUser: adminProtected(({id}) => {
		return simpleResult(dbSchema.User.findOneAndUpdate({id: id}, {'$set': {approved: true}}));
	})
};
