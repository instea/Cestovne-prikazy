import React, { Component } from 'react';
import LoadingIndicator from 'react-loading-indicator';
import ErrorMessage from './ErrorMessage';

class WithProgress extends Component {

  renderLoading() {
    return <LoadingIndicator />;
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
