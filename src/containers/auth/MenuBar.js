import './MenuBar.css';

import React, {Component} from 'react';
import {Nav, NavItem, Navbar, NavDropdown, MenuItem, Glyphicon} from 'react-bootstrap';
import {connect} from 'react-redux';
import {push} from 'react-router-redux';
import {pathname} from '../../selectors/router';
import * as actions from '../../actions/authActions';
import withUser from '../../components/withUser';
import _ from 'lodash';
import {compose} from 'react-apollo';
import {bindActionCreators} from 'redux';

const NavLoggedIn = withUser((props) => (
  <NavDropdown title={
    <span>
      <Glyphicon glyph="user" className={props.isAdmin ? 'admin-icon' : ''} />
      {props.user.firstName}
    </span>
  } id="user-dropdown">
    <MenuItem onClick={() => props.goTo(`/users/edit/${props.user.id}`)}>Profile</MenuItem>
    <MenuItem onClick={() => props.logout()}>Sign out</MenuItem>
  </NavDropdown>
));

const NavLoggedOut = (props) => (
  <NavItem onClick={() => props.goTo('/login')} active={props.path.startsWith('/login')}>Login</NavItem>
);

class MenuBar extends Component {

  renderMenuItems() {
    const links = [
      {label: 'Trips', link: '/trips', privilege: 'user'},
      {label: 'Places', link: '/places', privilege: 'user'},
      {label: 'Users', link: '/users', privilege: 'admin'},
      {label: 'Export', link: '/export', privilege: 'user'}
    ];

    return links
      .map(link => {
        const navItem = (
          <NavItem
            onClick={() => this.props.goTo(link.link)}
            active={this.props.path.startsWith(link.link)}
            key={link.link}>

            {link.privilege === 'admin' && (
              <Glyphicon glyph="lock" className={this.props.isAdmin ? '' : 'admin-link-unallowed'} />
            )}
            {link.label}
          </NavItem>
        );

        const hasPrivileges = (!link.privilege)
          || (link.privilege === 'user' && this.props.isLoggedIn)
          || (link.privilege === 'admin' && this.props.isAdmin);

        return hasPrivileges ? navItem : null;
      });
  }

  render() {

    const props = _.omit(this.props, ['data']);

    return (
      <Navbar>
        <Navbar.Collapse>
          <Nav>
            <NavItem href="/leaves/">Leaves &lt;</NavItem>
            {this.renderMenuItems()}
          </Nav>
          <Nav pullRight className="nav-user">
            {this.props.isLoggedIn
              ? (<NavLoggedIn {..._.pick(props, ['logout', 'goTo', 'path'])} />)
              : (<NavLoggedOut {..._.pick(props, ['goTo', 'path'])} />)}
          </Nav>
        </Navbar.Collapse>
      </Navbar>
    );
  }

}

const mapStateToProps = (state) => ({
  path: pathname(state)
});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  logout: (mutate) => actions.logout(mutate),
  goTo: (link) => push(link)
}, dispatch);

export default compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  withUser
)(MenuBar);
