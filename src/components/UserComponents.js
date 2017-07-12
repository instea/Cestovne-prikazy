import React from 'react';
import {connect} from 'react-redux';
import {gql, graphql, compose} from 'react-apollo';
import WithProgress from './WithProgress';
import _ from 'lodash';

export const IfLoggedIn = (props) => props.children;
export const IfLoggedOut = (props) => props.children;
export const IfLoggedInAsAdmin = (props) => props.children;

class _UserSwitch extends WithProgress {

  errorMessage(error) {
    return `Error while fetching user data: ${error.message}`;
  }

  renderData(data) {
    const user = data.getUserInfo;

    return (
      <this.props.component {..._.omit(this.props, ['component', 'data'])}>
        {
          React.Children.map(this.props.children, child => {
            if (child.type === IfLoggedIn) {
              if (user) {
                if (child.props.injectUser) {
                  return React.cloneElement(child.props.children, {
                    user
                  });
                }
                return child;
              }
            } else if (child.type === IfLoggedOut) {
              if (!user) {
                return child.props.children;
              }
            } else if (child.type === IfLoggedInAsAdmin) {
              if (user && user.isAdmin) {
                return child.props.children;
              }
            } else {
              return child;
            }
          })
        }
      </this.props.component>
    );
  }

}

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({});

export const UserSwitch = compose(
  graphql(gql`
    query GetUserInfo {
      getUserInfo {
        id,
        username,
        isAdmin
      }
    }
  `),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(_UserSwitch);
