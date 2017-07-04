import './TripForm.css';
import Trip from '../models/Trip';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader, FormGroup, FormControl, ControlLabel} from 'react-bootstrap';
import Datetime from 'react-datetime';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import {Field, reduxForm} from 'redux-form';

const ReduxDatetime = (field) => (
  <Datetime {...field.input} dateFormat="D. M. YYYY" timeFormat="H:mm" />
);

const ReduxInput = (field) => (
  <FormControl type="text" {...field.input} />
);

const FormEl = props => (
  <Row>
    <Col componentClass={ControlLabel} sm={2} smOffset={2}>
      <ControlLabel>{props.label}</ControlLabel>
    </Col>
    <Col sm={6}>
      {props.children}
    </Col>
  </Row>
);

class TripForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.isNew ? 'Add trip' : 'Edit trip'}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <FormGroup controlId="trip-form">

              <FormEl label="Starting at:">
                <Field name="from" component={ReduxDatetime} />
              </FormEl>

              <FormEl label="Ending at:">
                <Field name="to" component={ReduxDatetime} />
              </FormEl>

              <FormEl label="Place:">
                <Field name="place" component={ReduxInput} />
              </FormEl>

            </FormGroup>
            <Row>
              <Col smOffset={4} sm={4}>
                <ButtonToolbar>
                  <Button bsStyle="primary" type="submit">Save</Button>
                  <Button bsStyle="danger" onClick={this.props.onCancel}>Cancel</Button>
                </ButtonToolbar>
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
    );
  }

}

const mapStateToProps = (state) => {
  return {
    initialValues: state.formInitialValues.trip
  };
};

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onCancel: () => {
      dispatch(actions.cancelForm());
    },
    onSubmit: (values) => {
      ownProps.onSave(new Trip().merge(values));
    }
  };
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(reduxForm({
  form: 'trip'
})(TripForm));
