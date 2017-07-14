import {connect} from 'react-redux';
import {getUserInfo} from '../selectors/user';

const mapStateToProps = (state) => {
  const user = getUserInfo(state);

  return {
    user,
    isLoggedIn: !!user,
    isLoggedOut: !user,
    isAdmin: user && user.isAdmin
  };
};

const mapDispatchToProps = (dispatch, ownProps) => ({});

const withUser = connect(
  mapStateToProps,
  mapDispatchToProps
);

export default withUser;
