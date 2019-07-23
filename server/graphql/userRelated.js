const uuid = require('uuid');
const dbSchema = require('../db/schema');
const {userProtected, adminProtected, ownerProtected} = require('../auth/rootResolverDecorators');
const {createJwt, checkCredentials, hashPassword} = require('../auth/operations');
const {getUser} = require('../service/userService');
const User = require('../../src/data/User');
const simpleResult = require('./utils').simpleResult;
const {OAuth2Client} = require('google-auth-library');
const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

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

			const hostedDomain = process.env.HOSTED_DOMAIN;
			if (hostedDomain && hostedDomain !== domain) {
				return {
					success: false,
					message: 'Hosted domain does not match!'
				}
			}
			return getUser(userid)
				.then(user => {
					if (user.approved) {
						return {
							success: true,
							payload: createJwt(user).compact()
						}
					} else {
						return {
							success: true,
							message: 'Registration successful, wait for approval by admin',
						}
					}
				})
				.catch(() => {
					const new_user = new dbSchema.User(User.create(Object.assign({
						id: userid,
						firstName: payload.given_name,
						surname: payload.family_name,
						degrees: '',
						address: '',
						email: payload.email,
						approved: false
					}, {}), '', false)).save();
					console.log(new_user);
					return {
						success: true,
						message: 'Registration successful, wait for approval by admin',
					}
				})
		}).catch((err) => {
			return {
				success: false,
				message: err
			}
		});
	},

	createUser: adminProtected(({user}) => hashPassword(user.password || '').then((hash) => {
		return new dbSchema.User(User.create(Object.assign(user, {
			id: uuid.v4()
		}), hash, !!user.isAdmin)).save();
	})),

	updateUser: ownerProtected(({id, user}, context) => {
		if (!context.checkUserId) {
			return Promise.resolve({
				success: false,
				message: 'Not authorized'
			});
		}
		const updatePassword = !!user.password;
		return hashPassword(user.password || '').then((hash) => {
			const userData = User.create(user, updatePassword ? hash : undefined, context.user.isAdmin ? !!user.isAdmin : undefined);
			return simpleResult(dbSchema.User.findOneAndUpdate({id: id}, {'$set': userData}));
		});
	}),

	removeUser: adminProtected(({id}) => simpleResult(dbSchema.User.findOneAndRemove({id: id})))
};
