import React from 'react';
import LoadingIndicator from 'react-loading-indicator';
import ErrorMessage from './ErrorMessage';

export default function withProgress(opts) {

  if (!opts.errorMessage) {
    opts.errorMessage = (err) => err.message;
  }

  return (Component) => {
    return (props) => {

      const {loading, error} = props.data || {};

      if (loading) {
        return <LoadingIndicator />;
      }

      if (error) {
        return <ErrorMessage>{opts.errorMessage(error)}</ErrorMessage>;
      }

      const inlineData = {};
      if (opts.dataMappings) {
        Object.keys(opts.dataMappings).forEach(key => inlineData[key] = props.data[opts.dataMappings[key]]);
      }

      return <Component {...props} {...inlineData} />;

    };
  };

};
