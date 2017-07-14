import './TripForm.css';

import React, {Component} from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {Field, reduxForm} from 'redux-form';
import {goBack} from 'react-router-redux';
import {ReduxFormInput, ReduxFormDatetime, ReduxFormSelect, required} from '../../components//FormHelpers';
import * as TravelType from '../../data/TravelType';

class TripForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.header}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <Field name="userId" label="Who:" id="userId" type="text" component={ReduxFormInput} validate={required} />
            <Field name="placeId" label="Where:" id="placeId" type="text" component={ReduxFormInput} validate={required} />
            <Field name="departureTime" label="Time of departure:" id="departureTime" component={ReduxFormDatetime} validate={required} />
            <Field name="arrivalTime" label="Time of arrival:" id="arrivalTime" component={ReduxFormDatetime} validate={required} />
            <Field name="purpose" label="Purpose:" id="purpose" type="text" component={ReduxFormInput} validate={required}
              placeholder='Example: konzultácie' />
            <Field name="travelType" label="Type of travel:" id="travelType" component={ReduxFormSelect}
              options={TravelType.values.map(val => ({
                value: val.code,
                label: val.label
              }))} />
            <Field name="priceOfTravel" label="Price of travel:" id="priceOfTravel" type="number"
              component={ReduxFormInput} validate={required} />
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
    dispatch(goBack());
  },
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
