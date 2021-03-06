import './UserForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {Field, reduxForm} from 'redux-form';
import {goBack} from 'react-router-redux';
import {ReduxFormInput, ReduxFormCheckbox} from '../../components/FormHelpers';
import withUser from '../../components/withUser';
import Unauthorized from '../../components/Unauthorized';
import {compose} from 'react-apollo';
import {bindActionCreators} from 'redux';

class UserForm extends Component {

  render() {
    const {header, handleSubmit, onCancel, isAdmin, userId, ownerId, children} = this.props;

    if (!isAdmin && userId !== ownerId) {
      return <Unauthorized />;
    }

    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{header}</PageHeader>
          <form onSubmit={handleSubmit}>
            {children}
            <Field name="email" label="Email:" id="email" type="text" component={ReduxFormInput} disabled={true} />
            <Field name="firstName" label="First name:" id="firstName" type="text" component={ReduxFormInput} />
            <Field name="surname" label="Surname:" id="surname" type="text" component={ReduxFormInput} />
            <Field name="degrees" label="Degrees:" id="degrees" type="text" component={ReduxFormInput} />
            <Field name="address" label="Address:" id="address" componentClass="textarea" component={ReduxFormInput} />
            <Field name="approved" label="Is approved:" id="approved" component={ReduxFormCheckbox} disabled={true} />
            {isAdmin ? <Field name="isAdmin" label="Is admin:" id="isAdmin" component={ReduxFormCheckbox} /> : null}
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
    form: 'user',
  }),
  withUser
)(UserForm);
