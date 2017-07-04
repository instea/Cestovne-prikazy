import './TripForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader, FormGroup, FormControl, ControlLabel} from 'react-bootstrap';
import Datetime from 'react-datetime';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';

class TripForm extends Component {

  handleDateChange = (key, value) => {
    this.props.onChange(key, value);
  }

  handleChange = (e) => {
    this.props.onChange(e.target.name, e.target.value);
  }

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{typeof this.props.id === 'undefined' ? 'Add trip' : 'Edit trip'}</PageHeader>
          <form>
            <Row>
              <FormGroup controlId="trip-form">

                <ControlLabel>Starting at:</ControlLabel>
                <Datetime value={this.props.data.from} dateFormat="D. M. YYYY" timeFormat="H:mm" onChange={(val) => this.handleDateChange('from', val)} />

                <ControlLabel>Ending at:</ControlLabel>
                <Datetime value={this.props.data.to} dateFormat="D. M. YYYY" timeFormat="H:mm" onChange={(val) => this.handleDateChange('to', val)} />

                <ControlLabel>Place of trip:</ControlLabel>
                <FormControl type="text" name="place" placeholder="Place" value={this.props.data.place} onChange={this.handleChange} />

              </FormGroup>
            </Row>
            <Row>
              <ButtonToolbar>

                <Button bsStyle="danger"
                  onClick={() => this.props.onCancel()}>
                    Cancel
                </Button>

                <Button bsStyle="primary"
                  onClick={() => this.props.onSave(this.props.data)}>
                    Save
                </Button>

              </ButtonToolbar>
            </Row>
          </form>
        </Col>
      </Row>
    );
  }

}

const mapStateToProps = (state) => {
  return {
    data: state.form
  }
}

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onSave: (trip) => {
      if (ownProps.isNew) {
        dispatch(actions.addTrip(trip));
      } else {
        dispatch(actions.editTrip(trip));
      }
    },
    onCancel: () => {
      dispatch(actions.cancelForm());
    },
    onChange: (key, value) => {
      dispatch(actions.modifyFormField(key, value));
    }
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(TripForm);
