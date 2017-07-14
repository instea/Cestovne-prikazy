import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import store from './singletons/store';
import apolloClient from './singletons/apolloClient';
import registerServiceWorker from './registerServiceWorker';
import {ApolloProvider} from 'react-apollo';

const render = () => {
  const App = require('./App').default;
  ReactDOM.render((
    <ApolloProvider store={store} client={apolloClient}>
      <App />
    </ApolloProvider>
  ), document.getElementById('root'));
};

render();
registerServiceWorker();

if (module.hot) {
  module.hot.accept('./App', render);
}
