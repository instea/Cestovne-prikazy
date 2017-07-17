import './TripForm.css';

import React, {Component} from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {Field, reduxForm} from 'redux-form';
import {goBack} from 'react-router-redux';
import {ReduxFormInput, ReduxFormDatetime, ReduxFormSelect} from '../../components//FormHelpers';
import * as TravelType from '../../data/TravelType';
import {required} from '../../core/validation';
import {bindActionCreators} from 'redux';

class TripForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.header}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <Field name="userId" label="Who:" id="userId" type="text" component={ReduxFormInput} />
            <Field name="placeId" label="Where:" id="placeId" type="text" component={ReduxFormInput} />
            <Field name="departureTime" label="Time of departure:" id="departureTime" component={ReduxFormDatetime} />
            <Field name="arrivalTime" label="Time of arrival:" id="arrivalTime" component={ReduxFormDatetime} />
            <Field name="purpose" label="Purpose:" id="purpose" type="text" component={ReduxFormInput}
              placeholder='Example: konzultácie' />
            <Field name="travelType" label="Type of travel:" id="travelType" component={ReduxFormSelect}
              options={TravelType.values.map(val => ({
                value: val.code,
                label: val.label
              }))} />
            <Field name="priceOfTravel" label="Price of travel:" id="priceOfTravel" type="number" component={ReduxFormInput} />
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

const interFieldValidations = (values) => {
  const errors = {};

  if (values.from && values.to && values.from.toDate() > values.to.toDate()) {
    errors.to = 'Must be after the start';
  }

  return errors;
};

const validate = (values) => ({
  ...required(values, 'userId', 'placeId', 'departureTime', 'arrivalTime', 'purpose', 'priceOfTravel'),
  ...interFieldValidations(values)
});

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  ...bindActionCreators({
    onCancel: () => goBack()
  }, dispatch),
  onSubmit: (values) => {
    ownProps.onSave(values);
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(reduxForm({
  form: 'trip',
  validate
})(TripForm));
