import './TripForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader, FormGroup, FormControl, ControlLabel, HelpBlock} from 'react-bootstrap';
import Datetime from 'react-datetime';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import {Field, reduxForm} from 'redux-form';
import {push} from 'react-router-redux';

const ReduxDatetime = (field) => (
  <Row>
    <FormGroup controlId={"fc" + field.id} validationState={field.meta.touched && field.meta.error ? "error" : undefined}>
      <Col componentClass={ControlLabel} sm={2} smOffset={2}>
        {field.label}
      </Col>
      <Col sm={6}>
        <Datetime {...field.input} dateFormat="D. M. YYYY" timeFormat="H:mm" />
        {field.meta.touched && field.meta.error && <HelpBlock>{field.meta.error}</HelpBlock>}
      </Col>
    </FormGroup>
  </Row>
);

const ReduxInput = (field) => (
  <Row>
    <FormGroup controlId={"fc" + field.id} validationState={field.meta.touched && field.meta.error ? "error" : undefined}>
      <Col componentClass={ControlLabel} sm={2} smOffset={2}>
        {field.label}
      </Col>
      <Col sm={6}>
        <FormControl type="text" {...field.input} />
        {field.meta.touched && field.meta.error && <HelpBlock>{field.meta.error}</HelpBlock>}
      </Col>
    </FormGroup>
  </Row>
);

class TripForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.header}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <Field name="from" label="Starting at:" id="from" component={ReduxDatetime} />
            <Field name="to" label="Ending at:" id="to" component={ReduxDatetime} />
            <Field name="place" label="Place:" id="place" component={ReduxInput} />
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

const validate = (values) => {
  const errors = {};

  const from = values.from && values.from.toDate();
  const to = values.to && values.to.toDate();
  const now = new Date();

  if (from && from <= now) {
    errors.from = 'Must be in the future';
  }

  if (to && to <= now) {
    errors.to = 'Must be in the future';
  } else if (from && to && from > to) {
    errors.to = 'Must be after the start';
  }

  if (!values.place) {
    errors.place = 'Required'
  } else if (values.place.length < 3) {
    errors.place = 'Must be at least 3 characters long';
  }

  return errors;
};

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onCancel: () => {
    dispatch(actions.cancelForm());
    dispatch(push('/'));
  },
  onSubmit: (values) => {
    ownProps.onSave(values);
    dispatch(push('/'));
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(reduxForm({
  form: 'trip',
  validate
})(TripForm));
