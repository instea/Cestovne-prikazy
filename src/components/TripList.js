import './TripList.css';

import React from 'react';
import {Row, Col, ButtonToolbar, Button, Table, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {push} from 'react-router-redux';
import {gql, graphql, compose} from 'react-apollo';
import WithProgress from './WithProgress';
import {dateToStr} from './FormHelpers';

class TripList extends WithProgress {

  errorMessage(error) {
    return `Error while fetching list: ${error.message}`;
  }

  renderData(data) {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>Trips</PageHeader>
            <Table striped bordered>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Place</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {(data.getTrips || []).map(trip => (<tr key={trip.id}>
                  <td>{dateToStr(trip.from)}</td>
                  <td>{dateToStr(trip.to)}</td>
                  <td>{trip.place}</td>
                  <td>
                    <ButtonToolbar>
                      <Button bsStyle="danger" onClick={(e) => this.props.onRemove(trip, this.props.mutate)}>Remove</Button>
                      <Button bsStyle="info" onClick={(e) => this.props.onEdit(trip)}>Edit</Button>
                    </ButtonToolbar>
                  </td>
                </tr>))}
                <tr>
                  <td colSpan={3}></td>
                  <td><Button bsStyle="success" onClick={(e) => this.props.onAdd()}>Add</Button></td>
                </tr>
              </tbody>
            </Table>
        </Col>
      </Row>
    );
  }

}

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onAdd: () => {
    dispatch(push('/trips/add'));
  },
  onEdit: (trip) => {
    dispatch(push(`/trips/edit/${trip.id}`));
  },
  onRemove: (trip) => {
    ownProps.mutate({
      variables: {
        id: trip.id
      }
    });
  }
});

export default compose(
  graphql(gql`
    query GetTrips {
      getTrips {
        id,
        from,
        to,
        place
      }
    }
  `),
  graphql(gql`
    mutation ($id: String!) {
      removeTrip(id: $id) {
        success
      }
    }
  `, {
    options: {
      refetchQueries: ['GetTrips']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(TripList);
