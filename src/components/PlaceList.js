import './PlaceList.css';

import React from 'react';
import {Row, Col, ButtonToolbar, Button, Table, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {push} from 'react-router-redux';
import {gql, graphql, compose} from 'react-apollo';
import WithProgress from './WithProgress';
import * as Place from '../data/Place';
import {durationToStr} from './FormHelpers';

class PlaceList extends WithProgress {

  errorMessage(error) {
    return `Error while fetching list: ${error.message}`;
  }

  renderData(data) {

    const places = (data.getPlaces || []).map(Place.serializableToFull);

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
                    <ButtonToolbar>
                      <Button bsStyle="danger" onClick={(e) => this.props.onRemove(place, this.props.mutate)}>Remove</Button>
                      <Button bsStyle="info" onClick={(e) => this.props.onEdit(place)}>Edit</Button>
                    </ButtonToolbar>
                  </td>
                </tr>))}
                <tr>
                  <td colSpan={4}></td>
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
    dispatch(push('/places/add'));
  },
  onEdit: (trip) => {
    dispatch(push(`/places/edit/${trip.id}`));
  },
  onRemove: (place) => {
    ownProps.mutate({
      variables: {
        id: place.id
      }
    });
  }
});

export default compose(
  graphql(gql`
    query GetPlaces {
      getPlaces {
        id,
        name,
        destinationName,
        originName,
        travelDuration
      }
    }
  `),
  graphql(gql`
    mutation ($id: String!) {
      removePlace(id: $id) {
        success
      }
    }
  `, {
    options: {
      refetchQueries: ['GetPlaces']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(PlaceList);
