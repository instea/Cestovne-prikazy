import './PlaceList.css';

import React from 'react';
import {Row, Col, ButtonToolbar, Button, Table, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {push} from 'react-router-redux';
import {gql, graphql, compose} from 'react-apollo';
import withProgress from '../../components/withProgress';
import withUser from '../../components/withUser';
import Unauthorized from '../../components/Unauthorized';
import * as Place from '../../data/Place';
import {durationToStr} from '../../components/FormHelpers';
import * as actions from '../../actions/placeActions';
import {bindActionCreators} from 'redux';

const PlaceList = ({places: rawPlaces, onAdd, onEdit, onRemove, isAdmin, isLoggedIn}) => {

  if (!isLoggedIn) {
    return <Unauthorized />;
  }

  const places = (rawPlaces || []).map(Place.serializableToFull);

  return (
    <Row>
      <Col sm={12}>
        <PageHeader>Places</PageHeader>
          <Table striped bordered>
            <thead>
              <tr>
                <th>Name</th>
                <th>Destination name</th>
                <th>Origin name</th>
                <th>Travel duration</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {places.map(place => (<tr key={place.id}>
                <td>{place.name}</td>
                <td>{place.destinationName}</td>
                <td>{place.originName}</td>
                <td>{durationToStr(place.travelDuration)}</td>
                <td>
                  {isAdmin && (
                    <ButtonToolbar>
                      <Button bsStyle="danger" onClick={(e) => onRemove(place)}>Remove</Button>
                      <Button bsStyle="info" onClick={(e) => onEdit(place)}>Edit</Button>
                    </ButtonToolbar>
                  )}
                </td>
              </tr>))}
              <tr>
                <td colSpan={4}></td>
                <td>
                  {isAdmin && <Button bsStyle="success" onClick={onAdd}>Add</Button>}
                </td>
              </tr>
            </tbody>
          </Table>
      </Col>
    </Row>
  );
};

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onAdd: () => push('/places/add'),
  onEdit: (place) => push(`/places/edit/${place.id}`),
  onRemove: (place) => actions.removePlace(place.id)
}, dispatch);

export const query = gql`
  query GetPlaces {
    getPlaces {
      id,
      name,
      destinationName,
      originName,
      travelDuration
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
      places: 'getPlaces'
    }
  })
)(PlaceList);
