import './PlaceForm.css';

import React, {Component} from 'react';
import {compose} from 'react-apollo';
import {Row, Col, ButtonToolbar, Button, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {Field, reduxForm} from 'redux-form';
import {goBack} from 'react-router-redux';
import {COUNTRIES} from '../../data/Countries';
import {ComboboxWrapper} from '../../components/ConnectedComboboxes';
import withUser from '../../components/withUser';
import Unauthorized from '../../components/Unauthorized';
import {ReduxFormInput, ReduxFormDuration, reduxFormComponent} from '../../components/FormHelpers';
import {required} from '../../core/validation';
import {bindActionCreators} from 'redux';

const CountryCombobox = reduxFormComponent((props) => (
  <ComboboxWrapper {...props} options={COUNTRIES.map(c => ({
    value: c.code,
    label: c.name,
    text: c.name
  }))} />
));

class PlaceForm extends Component {

  render() {

    const {header, handleSubmit, onCancel, isAdmin} = this.props;

    if (!isAdmin) {
      return <Unauthorized />;
    }

    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{header}</PageHeader>
          <form onSubmit={handleSubmit}>
            <Field name="name" label="Name:" id="name" component={ReduxFormInput} type="text"
              placeholder="Example: Viedeň, AT" />
            <Field name="destinationName" label="Destination name:" id="destinationName"
              component={ReduxFormInput} type="text" placeholder="Example: Viedeň" />
            <Field name="originName" label="Origin name:" id="originName" component={ReduxFormInput}
              type="text" placeholder="Example: Hranica SK-AT / Bratislava" />
            <Field name="travelDuration" label="Travel duration:" id="travelDuration"
              component={ReduxFormDuration} />
            <Field name="country" label="Country" id="country" component={CountryCombobox} />
            <Row>
              <Col xsOffset={4} xs={4} smOffset={3} sm={4} mdOffset={4} md={4} lgOffset={4} lg={4}>
                <ButtonToolbar>
                  <Button bsStyle="primary" type="submit">Save</Button>
                  <Button bsStyle="danger" onClick={onCancel}>Cancel</Button>
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

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  ...bindActionCreators({
    onCancel: () => goBack()
  }, dispatch),
  onSubmit: (values) => {
    ownProps.onSave(values);
  }
});

export default compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  reduxForm({
    form: 'place',
    validate
  }),
  withUser
)(PlaceForm);
