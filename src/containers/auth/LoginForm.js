import './LoginForm.css';

import React, {Component} from 'react';
import {Row, Col, ButtonToolbar, Button} from 'react-bootstrap';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../../actions/authActions';
import {Field, reduxForm} from 'redux-form';
import {compose} from 'react-apollo';
import {ReduxFormInput} from '../../components/FormHelpers';
import ErrorMessage from '../../components/ErrorMessage';
import {required} from '../../core/validation';
import {bindActionCreators} from 'redux';

class LoginForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <form onSubmit={this.props.handleSubmit}>
            {this.props.errMessage ? <ErrorMessage>{this.props.errMessage}</ErrorMessage> : <span />}
            <Field name="username" label="Username:" id="username" component={ReduxFormInput} type="text" />
            <Field name="password" label="Password:" id="password" component={ReduxFormInput} type="password" />
            <Row>
              <Col xsOffset={4} xs={4} smOffset={3} sm={4} mdOffset={4} md={4} lgOffset={4} lg={4}>
                <ButtonToolbar>
                  <Button bsStyle="primary" type="submit">Login</Button>
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
  ...required(values, 'username', 'password')
});

const mapStateToProps = (state) => ({
  errMessage: state.user.get('loginFailed') ? 'Incorrect username or password!' : ''
});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSubmit: (values) => actions.login(values.username, values.password)
}, dispatch);

export default compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  reduxForm({
    form: 'login',
    validate
  })
)(LoginForm);