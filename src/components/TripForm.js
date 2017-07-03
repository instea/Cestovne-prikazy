import './TripForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader, FormGroup, FormControl, ControlLabel} from 'react-bootstrap';
import moment from 'moment';
import Datetime from 'react-datetime';
import 'react-datetime/css/react-datetime.css';

import Trip from '../models/Trip';

class TripForm extends Component {

  static defaultProps = {
    data: {
      from: moment().add(1, 'hours'),
      to: moment().add(3, 'hours'),
      place: ''
    },
    onSave: () => {}
  };

  constructor(props) {
    super(props);
    this.state = {
      id: props.data.id,
      from: props.data.from,
      to: props.data.to,
      place: props.data.place
    };
  }

  handleChange = (key, value) => {
    if (key.target) {
      const e = key;
      this.setState({
        [e.target.name]: e.target.value
      });
    } else {
      this.setState({
        [key]: value
      });
    }
  }

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{typeof this.state.id === 'undefined' ? 'Add trip' : 'Edit trip'}</PageHeader>
          <form>
            <FormGroup controlId="trip-form">

              <ControlLabel>Starting at:</ControlLabel>
              <Datetime value={this.state.from} dateFormat="D. M. YYYY" timeFormat="H:mm" onChange={(val) => this.handleChange('from', val)} />

              <ControlLabel>Ending at:</ControlLabel>
              <Datetime value={this.state.to} dateFormat="D. M. YYYY" timeFormat="H:mm" onChange={(val) => this.handleChange('to', val)} />

              <ControlLabel>Place of trip:</ControlLabel>
              <FormControl type="text" name="place" placeholder="Place" value={this.state.place} onChange={this.handleChange} />

              <Button bsStyle="primary"
                onClick={() => this.props.onSave(new Trip(this.state.from, this.state.to, this.state.place, this.state.id))}>
                  Save
              </Button>

            </FormGroup>
          </form>
        </Col>
      </Row>
    );
  }

}

export default TripForm;
