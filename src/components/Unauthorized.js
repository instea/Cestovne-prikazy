import React from 'react';
import ErrorMessage from './ErrorMessage';

const Unauthorized = (props) => (
  <div>
    <ErrorMessage>You are not authorized to view this page!</ErrorMessage>
  </div>
);

export default Unauthorized;