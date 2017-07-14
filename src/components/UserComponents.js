import React from 'react';
import {connect} from 'react-redux';
import {gql, graphql, compose} from 'react-apollo';
import withProgress from './withProgress';
import _ from 'lodash';

export const IfLoggedIn = (props) => props.children;
export const IfLoggedOut = (props) => props.children;
export const IfLoggedInAsAdmin = (props) => props.children;

const _UserSwitch = (props) => (
  <props.component {..._.omit(props, ['component', 'data'])}>
    {
      React.Children.map(props.children, child => {
        if (child.type === IfLoggedIn) {
          if (props.user) {
            if (child.props.injectUser) {
              return React.cloneElement(child.props.children, {
                user: props.user
              });
            }
            return child;
          }
        } else if (child.type === IfLoggedOut) {
          if (!props.user) {
            return child.props.children;
          }
        } else if (child.type === IfLoggedInAsAdmin) {
          if (props.user && props.user.isAdmin) {
            return child.props.children;
          }
        } else {
          return child;
        }
      })
    }
  </props.component>
);

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({});

export const UserSwitch = compose(
  graphql(gql`
    query GetUserInfo {
      getUserInfo {
        id,
        username,
        firstName,
        surname,
        isAdmin
      }
    }
  `),
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  withProgress({
    errorMessage: (error) => `Error while fetching user data: ${error.message}`,
    dataMappings: {
      user: 'getUserInfo'
    }
  })
)(_UserSwitch);
