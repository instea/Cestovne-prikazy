import './UserList.css';

import React from 'react';
import {Row, Col, ButtonToolbar, Button, Table, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {push} from 'react-router-redux';
import {gql, graphql, compose} from 'react-apollo';
import withProgress from '../../components/withProgress';
import withUser from '../../components/withUser';
import Unauthorized from '../../components/Unauthorized';
import * as actions from '../../actions/userActions';
import {bindActionCreators} from 'redux';

const UserList = ({users, onEdit, onRemove, onApprove, isAdmin}) => isAdmin ? (
  <Row>
    <Col sm={12}>
      <PageHeader>Users</PageHeader>
        <Table striped bordered>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Is admin</th>
              <th>Is approved</th>
              <th>Controls</th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map(user => (<tr key={user.id}>
              <td>{user.email}</td>
              <td>{user.surname}{user.firstName ? `, ${user.firstName}` : ''}{user.degrees ? `, ${user.degrees}` : ''}</td>
              <td>{user.isAdmin ? 'Yes' : 'No'}</td>
              <td>{user.approved ? 'Yes' : 'No'}</td>
              <td>
                <ButtonToolbar>
                  <Button bsStyle="danger" onClick={(e) => onRemove(user)}>Remove</Button>
                  <Button bsStyle="info" onClick={(e) => onEdit(user)}>Edit</Button>
                  {(!user.approved) ? <Button bsStyle="success" onClick={(e) => onApprove(user)}>Approve</Button> : null}
                </ButtonToolbar>
              </td>
            </tr>))}
          </tbody>
        </Table>
    </Col>
  </Row>
) : <Unauthorized />;

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onEdit: (user) => push(`/users/edit/${user.id}`),
  onRemove: (user) => actions.removeUser(user.id),
  onApprove: (user) => actions.approveUser(user.id),
}, dispatch);

export const query = gql`
  query GetUsers {
    getUsers {
      id,
      firstName,
      surname,
      degrees,
      isAdmin,
      approved,
      email
    }
  }
`;

export default compose(
  graphql(query),
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  withUser,
  withProgress({
    errorMessage: (error) => `Error while fetching list: ${error.message}`,
    dataMappings: {
      users: 'getUsers'
    }
  })
)(UserList);
