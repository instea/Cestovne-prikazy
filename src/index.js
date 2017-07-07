import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App, {store} from './App';
import registerServiceWorker from './registerServiceWorker';
import {ApolloClient, createNetworkInterface, ApolloProvider} from 'react-apollo';

const apolloClient = new ApolloClient({
  networkInterface: createNetworkInterface({
    uri: '/graphql',
  }),
});

ReactDOM.render((
   <ApolloProvider store={store} client={apolloClient}>
      <App />
   </ApolloProvider>
), document.getElementById('root'));
registerServiceWorker();

if (module.hot) {
   module.hot.accept('./App', () => {
      const NextApp = require('./App').default;
      ReactDOM.render((
         <ApolloProvider store={store} client={apolloClient}>
            <NextApp />
         </ApolloProvider>
      ), document.getElementById('root'));
  })
}
