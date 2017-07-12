import './MenuBar.css';

import React, {Component} from 'react';
import {Nav, NavItem, Navbar, NavDropdown, MenuItem} from 'react-bootstrap';
import {connect} from 'react-redux';
import {gql, graphql, compose} from 'react-apollo';
import {push} from 'react-router-redux';
import {pathname} from '../core/selectors';
import * as actions from '../dispatch/actions';
import {UserSwitch, IfLoggedIn, IfLoggedInAsAdmin, IfLoggedOut} from './UserComponents';
import _ from 'lodash';

const NavLoggedIn = (props) => (
  <NavDropdown title={props.user.firstName} id="user-dropdown" className={props.user.isAdmin ? 'user-admin' : 'user-non-admin'}>
    <MenuItem onClick={() => props.goTo(`/users/edit/${props.user.id}`)}>Profile</MenuItem>
    <MenuItem onClick={() => props.logout(props.userPing)}>Sign out</MenuItem>
  </NavDropdown>
);

const NavLoggedOut = (props) => (
  <NavItem onClick={() => props.goTo('/login')} active={props.path.startsWith('/login')}>Login</NavItem>
);

class MenuBar extends Component {

  renderMenuItems() {
    const links = [
      {label: 'Trips', link: '/trips', privilege: 'user'},
      {label: 'Users', link: '/users', privilege: 'admin'},
      {label: 'Export', link: '/export', privilege: 'user'}
    ];

    return links
      .map(link => {
        const navItem = (
          <NavItem
            onClick={() => this.props.goTo(link.link)}
            active={link.link === this.props.path}
            className={link.privilege === 'admin' ? 'admin-link' : ''}>

            {link.label}
          </NavItem>
        );
        if (!link.privilege) {
          return React.cloneElement(navItem, {
            key: link.link
          });
        } if (link.privilege === 'user') {
          return <IfLoggedIn key={link.link}>{navItem}</IfLoggedIn>;
        } if (link.privilege === 'admin') {
          return <IfLoggedInAsAdmin key={link.link}>{navItem}</IfLoggedInAsAdmin>;
        }
        return null;
      });
  }

  render() {

    const props = _.omit(this.props, ['data']);

    return (
      <Navbar>
        <Navbar.Collapse>
          <UserSwitch component={Nav}>
            {this.renderMenuItems()}
          </UserSwitch>
          <UserSwitch component={Nav} pullRight className="nav-user">
            <IfLoggedIn injectUser={true}>
              <NavLoggedIn {...props} />
            </IfLoggedIn>
            <IfLoggedOut>
              <NavLoggedOut {...props} />
            </IfLoggedOut>
          </UserSwitch>
        </Navbar.Collapse>
      </Navbar>
    );
  }

}

const mapStateToProps = (state) => ({
  path: pathname(state),
  jwt: state.user.get('jwt')
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  login: (username, password, mutate) => {
    dispatch(actions.login(username, password, mutate));
    dispatch(push("/"));
  },
  logout: (mutate) => {
    dispatch(actions.logout(mutate));
    dispatch(push("/"));
  },
  goTo: (link) => {
    dispatch(push(link));
  }
});

export default compose(
  graphql(gql`
    mutation {
      userPing {
        success
      }
    }
  `, {
    name: 'userPing',
    options: {
      refetchQueries: ['GetUserInfo', 'GetTrips', 'GetUsers']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(MenuBar);
