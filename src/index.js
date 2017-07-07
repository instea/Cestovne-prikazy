import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import {store} from './App';
import registerServiceWorker from './registerServiceWorker';
import {ApolloClient, createNetworkInterface, ApolloProvider} from 'react-apollo';

const apolloClient = new ApolloClient({
  networkInterface: createNetworkInterface({
    uri: '/graphql',
  }),
});

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
