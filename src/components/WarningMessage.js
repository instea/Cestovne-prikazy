import React, { Component } from 'react';

class WarningMessage extends Component {
  render() {
    return (
      <div className="alert alert-warning">
        {this.props.children}
      </div>
    );
  }
}

export default WarningMessage;
