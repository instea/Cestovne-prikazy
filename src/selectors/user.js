export const getJwt = (state) => state.user.get('jwt');
export const getUserInfo = (state) => state.user.get('info');
export const getLoginResult = (state) => state.user.get('loginResult');
