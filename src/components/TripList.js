import './TripList.css';

import React from 'react';
import {Row, Col, ButtonToolbar, Button, Table, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {push} from 'react-router-redux';
import {gql, graphql, compose} from 'react-apollo';
import WithProgress from './WithProgress';
import {dateToStr} from './FormHelpers';

const printDate = (date1, date2) => {
  const fd1 = dateToStr(date1);
  const fd2 = dateToStr(date2);

  if (fd1 === fd2) {
    return fd1;
  }
  return `${fd1} - ${fd2}`;
};

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
                  <th>Who</th>
                  <th>Destination</th>
                  <th>When</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {(data.getTrips || []).map(trip => (<tr key={trip.id}>
                  <td>{trip.user.surname}, {trip.user.firstName}</td>
                  <td>{trip.place.destinationName}</td>
                  <td>{printDate(trip.departureTime, trip.arrivalTime)}</td>
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
        place {
          destinationName
        },
        user {
          firstName,
          surname
        },
        departureTime,
        arrivalTime
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
