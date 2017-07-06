import React, { Component } from 'react';
import {ProgressBar} from 'react-bootstrap';
import ErrorMessage from './ErrorMessage';

class WithProgress extends Component {

  renderLoading() {
    return <ProgressBar active now={this.props.data.networkStatus * 100 / 7} />;
  }

  renderError(error) {
    return <ErrorMessage>{this.errorMessage(error)}</ErrorMessage>;
  }

  render() {
    const {loading, error} = this.props.data;

    if (loading) {
      return this.renderLoading();
    }

    if (error) {
      return this.renderError(error);
    }

    return this.renderData(this.props.data);

  }

}

export default WithProgress;
