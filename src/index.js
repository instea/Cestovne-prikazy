import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import store from './singletons/store';
import apolloClient from './singletons/apolloClient';
import {unregister as unregisterServiceWorker} from './registerServiceWorker';
import { GoogleOAuthProvider } from '@react-oauth/google';
import {ApolloProvider} from 'react-apollo';

const render = () => {
  const App = require('./App').default;
  ReactDOM.render((
    <GoogleOAuthProvider  clientId={process.env.REACT_APP_CLIENT_ID}> 
      <ApolloProvider store={store} client={apolloClient}>
        <App />
      </ApolloProvider>
    </GoogleOAuthProvider> 
  ), document.getElementById('root'));
};

render();
unregisterServiceWorker();

if (module.hot) {
  module.hot.accept('./App', render);
}
