import React, { Component } from 'react';

class ErrorMessage extends Component {
  render() {
    return (
         <div className="alert alert-danger">
            {this.props.children}
         </div>
    );
  }
}

export default ErrorMessage;
