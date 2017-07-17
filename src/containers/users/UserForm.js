import './UserForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, PageHeader} from 'react-bootstrap';
import {connect} from 'react-redux';
import {Field, reduxForm} from 'redux-form';
import {goBack} from 'react-router-redux';
import {ReduxFormInput, ReduxFormCheckbox} from '../../components//FormHelpers';
import withUser from '../../components//withUser';
import {compose} from 'react-apollo';
import {required} from '../../core/validation';
import {bindActionCreators} from 'redux';

class UserForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <PageHeader>{this.props.header}</PageHeader>
          <form onSubmit={this.props.handleSubmit}>
            <Field name="username" label="Username:" id="username" type="text" component={ReduxFormInput} />
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

const validate = (values) => ({
  ...required(values, 'username')
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
    form: 'user',
    validate
  }),
  withUser
)(UserForm);
