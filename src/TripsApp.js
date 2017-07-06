import './TripsApp.css';

import thunk from 'redux-thunk';
import {Grid, Row, Col} from 'react-bootstrap';
import React, {Component} from 'react';
import {connect} from 'react-redux';
import {createStore, combineReducers, applyMiddleware, compose} from 'redux';
import * as actions from './dispatch/actions';
import {Route} from 'react-router-dom';
import {ConnectedRouter, routerReducer, routerMiddleware} from 'react-router-redux';
import createHistory from 'history/createBrowserHistory';

import TripList from './components/TripList';
import AddTripForm from './components/AddTripForm';
import EditTripForm from './components/EditTripForm';

import * as reducers from './dispatch/reducers';
import {reducer as formReducer} from 'redux-form';

const reducer = combineReducers({
  ...reducers,
  router: routerReducer,
  form: formReducer
});

const history = createHistory();
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
const enhancer = composeEnhancers(applyMiddleware(thunk, routerMiddleware(history)));

export const store = createStore(reducer, /* preloadedState, */enhancer);

class TripsApp extends Component {

  componentDidMount() {
    this.props.onLoad();
  }

  render() {
    return (
      <ConnectedRouter history={history}>
        <Grid>
          <Row>
            <Col sm={12}>
              <Route exact path="/" component={TripList} />
              <Route path="/add" component={AddTripForm} />
              <Route path="/edit/:id" component={EditTripForm} />
            </Col>
          </Row>
        </Grid>
      </ConnectedRouter>
    );
  }

}

const mapStateToProps = (state) => {
  return {};
}

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onLoad: () => {
      dispatch(actions.loadState());
    },
    onAdd: (trip) => {
      dispatch(actions.addTrip(trip));
    },
    onEdit: (trip) => {
      dispatch(actions.editTrip(trip));
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(TripsApp);
