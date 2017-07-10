import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import {store} from './App';
import registerServiceWorker from './registerServiceWorker';
import {ApolloClient, createNetworkInterface, ApolloProvider} from 'react-apollo';

const networkInterface = createNetworkInterface({
  uri: '/graphql'
});
networkInterface.use([{
  applyMiddleware(req, next) {
    if (!req.options.headers) {
      req.options.headers = {};
    }
    const token = localStorage.getItem('jwt-token');
    if (token) {
      req.options.headers.authorization = `Bearer ${token}`;
    }
    next();
  }
}]);

const apolloClient = new ApolloClient({
  networkInterface: networkInterface,
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
