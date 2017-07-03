import './TripForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader, FormGroup, FormControl, ControlLabel} from 'react-bootstrap';
import moment from 'moment';
import Datetime from 'react-datetime';
import 'react-datetime/css/react-datetime.css';

import Trip from '../models/Trip';

class TripForm extends Component {

  static defaultProps = {
    onSave: () => {}
  };

  constructor(props) {
    super(props);
    this.state = {
      data: props.data || Trip.empty()
    };
  }

  setData(key, value) {
    const modifiedData = this.state.data.set(key, value);
    this.setState({
      data: modifiedData
    });
  }

  handleDateChange = (key, value) => {
    this.setData(key, value);
  }

  handleChange = (e) => {
    this.setData(e.target.name, e.target.value);
  }

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{typeof this.state.id === 'undefined' ? 'Add trip' : 'Edit trip'}</PageHeader>
          <form>
            <FormGroup controlId="trip-form">

              <ControlLabel>Starting at:</ControlLabel>
              <Datetime value={this.state.data.from} dateFormat="D. M. YYYY" timeFormat="H:mm" onChange={(val) => this.handleDateChange('from', val)} />

              <ControlLabel>Ending at:</ControlLabel>
              <Datetime value={this.state.data.to} dateFormat="D. M. YYYY" timeFormat="H:mm" onChange={(val) => this.handleDateChange('to', val)} />

              <ControlLabel>Place of trip:</ControlLabel>
              <FormControl type="text" name="place" placeholder="Place" value={this.state.data.place} onChange={this.handleChange} />

              <Button bsStyle="primary"
                onClick={() => this.props.onSave(this.state.data)}>
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
