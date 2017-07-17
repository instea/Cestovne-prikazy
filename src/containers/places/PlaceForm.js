import './PlaceForm.css';

import React, {Component} from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {Field, reduxForm, getFormValues} from 'redux-form';
import {goBack} from 'react-router-redux';
import {ReduxFormInput, ReduxFormDuration, ReduxFormCheckbox} from '../../components/FormHelpers';
import {required} from '../../core/validation';
import {bindActionCreators} from 'redux';

class PlaceForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.header}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <Field name="name" label="Name:" id="name" component={ReduxFormInput} type="text"
              placeholder="Example: Viedeň, AT" />
            <Field name="destinationName" label="Destination name:" id="destinationName"
              component={ReduxFormInput} type="text" placeholder="Example: Viedeň" />
            <Field name="originName" label="Origin name:" id="originName" component={ReduxFormInput}
              type="text" placeholder="Example: Hranica SK-AT / Bratislava" />
            <Field name="travelDuration" label="Travel duration:" id="travelDuration"
              component={ReduxFormDuration} />
            <Field name="isForeign" label="Is foreign" id="isForeign" component={ReduxFormCheckbox} />
            <Field name="basicTariff" label="Basic tariff (diet):" id="basicTariff" component={ReduxFormInput}
              type="number" disabled={this.props.basicTariffDisabled} />
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

const validate = (values) => ({
  ...required(values, 'name', 'destinationName', 'originName', 'travelDuration')
});

const mapStateToProps = (state) => {
  const values = getFormValues('place')(state);
  return {
    basicTariffDisabled: values && !values.isForeign
  };
};

const mapDispatchToProps = (dispatch, ownProps) => ({
  ...bindActionCreators({
    onCancel: () => goBack()
  }, dispatch),
  onSubmit: (values) => {
    const {isForeign, basicTariff, ...others} = values;
    ownProps.onSave({
      ...others,
      basicTariff: isForeign ? basicTariff : undefined
    });
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(reduxForm({
  form: 'place',
  validate
})(PlaceForm));
