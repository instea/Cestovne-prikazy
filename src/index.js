import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import TripsApp from './TripsApp';
import registerServiceWorker from './registerServiceWorker';

ReactDOM.render(<TripsApp />, document.getElementById('root'));
registerServiceWorker();
