import './PlaceForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {Field, reduxForm} from 'redux-form';
import {push, goBack} from 'react-router-redux';
import {ReduxFormInput, ReduxFormDuration, required} from './FormHelpers';

class PlaceForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.header}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <Field name="name" label="Name:" id="name" component={ReduxFormInput} type="text"
              placeholder="Example: Viedeň, AT" validate={required} />
            <Field name="destinationName" label="Destination name:" id="destinationName"
              component={ReduxFormInput} type="text" placeholder="Example: Viedeň" validate={required} />
            <Field name="originName" label="Origin name:" id="originName" component={ReduxFormInput}
              type="text" placeholder="Example: Hranica SK-AT / Bratislava" validate={required} />
            <Field name="travelDuration" label="Travel duration:" id="travelDuration"
              component={ReduxFormDuration} validate={required} />
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

  return errors;
};

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onCancel: () => {
    dispatch(goBack());
  },
  onSubmit: (values) => {
    ownProps.onSave(values);
    dispatch(push('/places'));
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(reduxForm({
  form: 'place',
  validate
})(PlaceForm));
