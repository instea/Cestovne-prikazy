import React, { Component } from 'react';
import {LoginResults} from '../data/LoginResults';
import ErrorMessage from './ErrorMessage';
import WarningMessage from './WarningMessage';

class LoginResultMessage extends Component {
  render() {
    let message;
    switch (this.props.loginResult) {
    case LoginResults.FAILED:
      message = <ErrorMessage>{'Login failed. Try again later.'}</ErrorMessage>;
      break;
    case LoginResults.WRONG_DOMAIN:
      message = <ErrorMessage>{'Used email does not belong to given hosted domain.'}</ErrorMessage>;
      break;
    case LoginResults.NEED_APPROVAL:
      message = <WarningMessage>{'Account needs to be approved by admin first.'}</WarningMessage>;
      break;
    default:
      message = null;
    }
    return(
      message
    );
  }
}

export default LoginResultMessage;
