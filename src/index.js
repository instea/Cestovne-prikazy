import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import TripsApp, {store} from './TripsApp';
import registerServiceWorker from './registerServiceWorker';
import {ApolloClient, createNetworkInterface, ApolloProvider} from 'react-apollo';

const apolloClient = new ApolloClient({
  networkInterface: createNetworkInterface({
    uri: '/graphql',
  }),
});

ReactDOM.render((
   <ApolloProvider store={store} client={apolloClient}>
      <TripsApp />
   </ApolloProvider>
), document.getElementById('root'));
registerServiceWorker();
