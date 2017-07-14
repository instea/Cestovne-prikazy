import {getJwt} from '../selectors/user';
import {ApolloClient, createNetworkInterface} from 'react-apollo';

const networkInterface = createNetworkInterface({
  uri: '/graphql'
});
networkInterface.use([{
  applyMiddleware(req, next) {
    if (!req.options.headers) {
      req.options.headers = {};
    }
    const store = require('./store').default;
    const token = getJwt(store.getState());
    if (token) {
      req.options.headers.authorization = `Bearer ${token}`;
    }
    next();
  }
}]);

const apolloClient = new ApolloClient({
  networkInterface: networkInterface
});

export default apolloClient;
