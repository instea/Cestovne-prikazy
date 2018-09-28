import './TripList.css';

import React from 'react';
import {
  Row,
  Col,
  ButtonToolbar,
  Button,
  Table,
  PageHeader
} from 'react-bootstrap';
import { connect } from 'react-redux';
import { push } from 'react-router-redux';
import { gql, graphql, compose } from 'react-apollo';
import withUser from '../../components/withUser';
import withProgress from '../../components/withProgress';
import { dateToStr } from '../../components/FormHelpers';
import Unauthorized from '../../components/Unauthorized';
import * as actions from '../../actions/tripActions';
import DuplicateTripButton from './DuplicateTripButton';

const printDate = (date1, date2) => {
  const fd1 = dateToStr(date1);
  const fd2 = dateToStr(date2);

  if (fd1 === fd2) {
    return fd1;
  }
  return `${fd1} - ${fd2}`;
};

const TripList = ({
  trips,
  onAdd,
  onRemove,
  onDuplicate,
  onEdit,
  userId,
  isAdmin,
  isLoggedIn
}) =>
  isLoggedIn ? (
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
            {(trips || []).map(trip => (
              <tr key={trip.id}>
                <td>
                  {trip.user.surname}, {trip.user.firstName}
                </td>
                <td>{trip.place.destinationName}</td>
                <td>{printDate(trip.departureTime, trip.arrivalTime)}</td>
                <td>
                  {(isAdmin || userId === trip.user.id) && (
                    <ButtonToolbar>
                      <Button bsStyle="danger" onClick={e => onRemove(trip)}>
                        Remove
                      </Button>
                      <Button bsStyle="info" onClick={e => onEdit(trip)}>
                        Edit
                      </Button>
                      <DuplicateTripButton trip={trip} />
                    </ButtonToolbar>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} />
              <td>
                <Button bsStyle="success" onClick={onAdd}>
                  Add
                </Button>
              </td>
            </tr>
          </tbody>
        </Table>
      </Col>
    </Row>
  ) : (
    <Unauthorized />
  );

const mapStateToProps = state => ({});

const mapDispatchToProps = {
  onAdd: () => push('/trips/add'),
  onEdit: trip => push(`/trips/edit/${trip.id}`),
  onRemove: trip => actions.removeTrip(trip.id)
};

export const query = gql`
  query GetTrips {
    getTrips {
      id
      place {
        destinationName
      }
      user {
        id
        firstName
        surname
      }
      departureTime
      arrivalTime
      # read data needed for duplication
      userId
      placeId
      purpose
      travelType
      priceOfTravel
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
    errorMessage: error => `Error while fetching list: ${error.message}`,
    dataMappings: {
      trips: 'getTrips'
    }
  })
)(TripList);
