import './MenuBar.css';

import React from 'react';
import {Nav, NavItem, Navbar, Glyphicon} from 'react-bootstrap';
import {connect} from 'react-redux';
import {gql, graphql, compose} from 'react-apollo';
import WithProgress from './WithProgress';
import {push} from 'react-router-redux';
import {pathname} from '../core/selectors';

class MenuBar extends WithProgress {

  errorMessage(error) {
    return `Error while fetching user data: ${error.message}`;
  }

  renderLoggedIn(user) {
    return (<div className="user {user.isAdmin ? 'user-admin' : 'user-non-admin'}">{user.name}</div>);
  }

  renderLoggedOut() {
    return (<div><Glyphicon glyph="alert" /> Logged out</div>);
  }

  renderMenuItems(user) {
    const links = [
      {label: 'Trips', link: '/trips/'}
    ];

    return links.map(link => <NavItem onClick={() => push(link.link)} active={link.link === this.props.path}>{link.label}</NavItem>);
  }

  renderData(data) {
    return (
      <Navbar>
        <Navbar.Collapse>
          <Nav>
            {this.renderMenuItems(data.getUser)}
          </Nav>
          <Nav pullRight>
            <Navbar.Text>{data.getUser === null
              ? this.renderLoggedOut()
              : this.renderLoggedIn(data.getUser)}
            </Navbar.Text>
          </Nav>
        </Navbar.Collapse>
      </Navbar>
    );
  }

}

const mapStateToProps = (state) => ({
  path: pathname(state)
});

const mapDispatchToProps = (dispatch, ownProps) => ({

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
    options: {
      refetchQueries: ['GetUser']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(MenuBar);
