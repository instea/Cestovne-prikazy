import './TripList.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, Table, PageHeader} from 'react-bootstrap';
import moment from 'moment';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';

function formatTime(date) {
  return moment(date).format('D. M. YYYY H:mm');
}

class TripList extends Component {

  render() {
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
              {this.props.data.map(trip => (<tr key={trip.id}>
                <td>{formatTime(trip.from)}</td>
                <td>{formatTime(trip.to)}</td>
                <td>{trip.place}</td>
                <td>
                  <ButtonToolbar>
                    <Button bsStyle="danger" onClick={(e) => this.props.onRemove(trip)}>Remove</Button>
                    <Button bsStyle="info" onClick={(e) => this.props.onEdit(trip)}>Edit</Button>
                  </ButtonToolbar>
                </td>
              </tr>))}
              <tr>
                <td></td>
                <td></td>
                <td></td>
                <td><Button bsStyle="success" onClick={(e) => this.props.onAdd()}>Add</Button></td>
              </tr>
            </tbody>
          </Table>
        </Col>
      </Row>
    );
  }

}

const mapStateToProps = (state) => {
  return {
    data: state.data
  }
}

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onAdd: () => {
      dispatch(actions.showForm());
    },
    onEdit: (trip) => {
      dispatch(actions.showForm(trip));
    },
    onRemove: (trip) => {
      dispatch(actions.removeTrip(trip.id));
    }
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(TripList);
