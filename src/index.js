import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import TripsApp, {store} from './TripsApp';
import registerServiceWorker from './registerServiceWorker';
import {Provider} from 'react-redux'

ReactDOM.render((
   <Provider store={store}>
      <TripsApp />
   </Provider>
), document.getElementById('root'));
registerServiceWorker();
