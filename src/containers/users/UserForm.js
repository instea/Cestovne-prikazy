import './UserForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {Field, reduxForm} from 'redux-form';
import {goBack} from 'react-router-redux';
import {ReduxFormInput, ReduxFormCheckbox, required} from '../../components//FormHelpers';
import withUser from '../../components//withUser';
import {compose} from 'react-apollo';

class UserForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.header}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <Field name="username" label="Username:" id="username" type="text" component={ReduxFormInput} validate={required} />
            {this.props.children}
            <Field name="firstName" label="First name:" id="firstName" type="text" component={ReduxFormInput} />
            <Field name="surname" label="Surname:" id="surname" type="text" component={ReduxFormInput} />
            <Field name="degrees" label="Degrees:" id="degrees" type="text" component={ReduxFormInput} />
            <Field name="address" label="Address:" id="address" componentClass="textarea" component={ReduxFormInput} />
            {this.props.isAdmin ? <Field name="isAdmin" label="Is admin:" id="isAdmin" component={ReduxFormCheckbox} /> : null}
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

export default compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  reduxForm({
    form: 'user',
    validate
  }),
  withUser
)(UserForm);
