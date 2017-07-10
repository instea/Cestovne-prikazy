import './TripForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader, FormGroup, FormControl, ControlLabel, HelpBlock} from 'react-bootstrap';
import Datetime from 'react-datetime';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import {Field, reduxForm} from 'redux-form';
import {push} from 'react-router-redux';

const FieldWrapper = (field) => (
  <Row>
    <FormGroup controlId={"fc" + field.id} validationState={field.meta.touched && field.meta.error ? "error" : undefined}>
      <Col componentClass={ControlLabel} xs={4} sm={3} smOffset={0} md={2} mdOffset={2}>
        {field.label}
      </Col>
      <Col xs={8} sm={9} md={6}>
        {field.children}
        {field.meta.touched && field.meta.error && <HelpBlock>{field.meta.error}</HelpBlock>}
      </Col>
    </FormGroup>
  </Row>
);

const ReduxFormDatetime = (field) => (
  <FieldWrapper {...field}>
    <Datetime {...field.input} dateFormat="D. M. YYYY" timeFormat="H:mm" />
  </FieldWrapper>
);

const ReduxFormInput = (field) => (
  <FieldWrapper {...field}>
    <FormControl type="text" {...field.input} />
  </FieldWrapper>
);

const required = (val) => !val && 'Required';
const minLength3 = (val) => val && val.length < 3 && 'Must be at least 3 characters long';

class TripForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.header}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <Field name="from" label="Starting at:" id="from" component={ReduxFormDatetime} validate={required} />
            <Field name="to" label="Ending at:" id="to" component={ReduxFormDatetime} validate={required} />
            <Field name="place" label="Place:" id="place" component={ReduxFormInput} validate={[required,minLength3]} />
            <Row>
              <Col xsOffset={4} xs={4} smOffset={3} sm={4} mdOffset={4} md={4} lgOffset={4} lg={4}>
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

  if (values.from && values.to && values.from.toDate() > values.to.toDate()) {
    errors.to = 'Must be after the start';
  }

  return errors;
};

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onCancel: () => {
    dispatch(actions.cancelForm());
    dispatch(push('/trips/'));
  },
  onSubmit: (values) => {
    ownProps.onSave(values);
    dispatch(push('/trips/'));
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(reduxForm({
  form: 'trip',
  validate
})(TripForm));
