import './UserList.css';

import React from 'react';
import {Row, Col, ButtonToolbar, Button, Table, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {push} from 'react-router-redux';
import {gql, graphql, compose} from 'react-apollo';
import withProgress from './withProgress';

const UserList = (props) => (
  <Row>
    <Col sm={12}>
      <PageHeader>Users</PageHeader>
        <Table striped bordered>
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Is admin</th>
              <th>Controls</th>
            </tr>
          </thead>
          <tbody>
            {(props.users || []).map(user => (<tr key={user.id}>
              <td>{user.username}</td>
              <td>{user.surname}{user.firstName ? `, ${user.firstName}` : ''}{user.degrees ? `, ${user.degrees}` : ''}</td>
              <td>{user.isAdmin ? 'Yes' : 'No'}</td>
              <td>
                <ButtonToolbar>
                  <Button bsStyle="danger" onClick={(e) => props.onRemove(user)}>Remove</Button>
                  <Button bsStyle="info" onClick={(e) => props.onEdit(user)}>Edit</Button>
                </ButtonToolbar>
              </td>
            </tr>))}
            <tr>
              <td colSpan={3}></td>
              <td><Button bsStyle="success" onClick={props.onAdd}>Add</Button></td>
            </tr>
          </tbody>
        </Table>
    </Col>
  </Row>
);

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onAdd: () => {
    dispatch(push('/users/add'));
  },
  onEdit: (user) => {
    dispatch(push(`/users/edit/${user.id}`));
  },
  onRemove: (user) => {
    ownProps.mutate({
      variables: {
        id: user.id
      }
    });
  }
});

export default compose(
  graphql(gql`
    query GetUsers {
      getUsers {
        id,
        username,
        firstName,
        surname,
        degrees,
        isAdmin
      }
    }
  `),
  graphql(gql`
    mutation ($id: String!) {
      removeUser(id: $id) {
        success
      }
    }
  `, {
    options: {
      refetchQueries: ['GetUsers']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  withProgress({
    errorMessage: (error) => `Error while fetching list: ${error.message}`,
    dataMappings: {
      users: 'getUsers'
    }
  })
)(UserList);
