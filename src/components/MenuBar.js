import './MenuBar.css';

import React from 'react';
import {Nav, NavItem, Navbar, NavDropdown, MenuItem} from 'react-bootstrap';
import {connect} from 'react-redux';
import {gql, graphql, compose} from 'react-apollo';
import WithProgress from './WithProgress';
import {push} from 'react-router-redux';
import {pathname} from '../core/selectors';
import * as actions from '../dispatch/actions';

class MenuBar extends WithProgress {

  errorMessage(error) {
    return `Error while fetching user data: ${error.message}`;
  }

  renderLoggedIn(user) {
    return (
      <NavDropdown title={user.name} id="user-dropdown" className={`user ${user.isAdmin ? 'user-admin' : 'user-non-admin'}`}>
        <MenuItem onClick={() => this.props.logout(this.props.dbLogout)}>Sign out</MenuItem>
      </NavDropdown>
    );
  }

  renderLoggedOut() {
    return (
      <NavDropdown title="Login" id="login-dropdown" className="login-button">

      </NavDropdown>
    );
  }

  renderMenuItems(user) {
    const links = [
      {label: 'Trips', link: '/trips/', privilege: 'user'},
      {label: 'Users', link: '/users/', privilege: 'admin'}
    ];

    return links
      .filter(link => !link.privilege || (link.privilege === 'user' && user) || (link.privilege === 'admin' && user && user.isAdmin))
      .map(link => <NavItem onClick={() => push(link.link)} key={link.link} active={link.link === this.props.path}>{link.label}</NavItem>);
  }

  renderData(data) {
    return (
      <Navbar>
        <Navbar.Collapse>
          <Nav>
            {this.renderMenuItems(data.getUser)}
          </Nav>
          <Nav pullRight>
            {data.getUser === null
              ? this.renderLoggedOut()
              : this.renderLoggedIn(data.getUser)}
          </Nav>
        </Navbar.Collapse>
      </Navbar>
    );
  }

}

const mapStateToProps = (state) => ({
  path: pathname(state),
  jwtToken: state.user.get('jwtToken')
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  login: (username, password, mutate) => {
    dispatch(actions.login(username, password, mutate));
    push("/");
  },
  logout: (mutate) => {
    dispatch(actions.logout(mutate));
    push("/");
  }
});

export default compose(
  graphql(gql`
    query GetUser {
      getUser {
        id,
        name,
        isAdmin
      }
    }
  `),
  graphql(gql`
    mutation ($username: String!, $password: String!) {
      loginUser(username: $username, password: $password) {
        success,
        message,
        payload
      }
    }
  `, {
    name: 'dbLogin',
    options: {
      refetchQueries: ['GetUser']
    }
  }),
  graphql(gql`
    mutation {
      logoutUser {
        success
      }
    }
  `, {
    name: 'dbLogout',
    options: {
      refetchQueries: ['GetUser', 'GetTrips']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(MenuBar);
