import './TripList.css';

import React from 'react';
import {Row, Col, ButtonToolbar, Button, Table, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {push} from 'react-router-redux';
import {gql, graphql, compose} from 'react-apollo';
import withProgress from '../../components/withProgress';
import {dateToStr} from '../../components//FormHelpers';
import * as actions from '../../actions/tripActions';
import {bindActionCreators} from 'redux';

const printDate = (date1, date2) => {
  const fd1 = dateToStr(date1);
  const fd2 = dateToStr(date2);

  if (fd1 === fd2) {
    return fd1;
  }
  return `${fd1} - ${fd2}`;
};

const TripList = (props) => (
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
            {(props.trips || []).map(trip => (<tr key={trip.id}>
              <td>{trip.user.surname}, {trip.user.firstName}</td>
              <td>{trip.place.destinationName}</td>
              <td>{printDate(trip.departureTime, trip.arrivalTime)}</td>
              <td>
                <ButtonToolbar>
                  <Button bsStyle="danger" onClick={(e) => props.onRemove(trip)}>Remove</Button>
                  <Button bsStyle="info" onClick={(e) => props.onEdit(trip)}>Edit</Button>
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

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onAdd: () => push('/trips/add'),
  onEdit: (trip) => push(`/trips/edit/${trip.id}`),
  onRemove: (trip) => actions.removeTrip(trip.id)
}, dispatch);

export const query = gql`
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
`;

export default compose(
  graphql(query),
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  withProgress({
    errorMessage: (error) => `Error while fetching list: ${error.message}`,
    dataMappings: {
      trips: 'getTrips'
    }
  })
)(TripList);
