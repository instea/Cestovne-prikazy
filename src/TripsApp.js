import './TripsApp.css';

import thunk from 'redux-thunk';
import {Grid, Row, Col} from 'react-bootstrap';
import React, {Component} from 'react';
import {connect} from 'react-redux';
import {createStore, combineReducers, applyMiddleware, compose} from 'redux';
import * as actions from './dispatch/actions';

import TripList from './components/TripList';
import TripForm from './components/TripForm';

import * as reducers from './dispatch/reducers';
import {reducer as formReducer} from 'redux-form';

const reducer = combineReducers({
  ...reducers,
  form: formReducer
});

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
const enhancer = composeEnhancers(applyMiddleware(thunk));

export const store = createStore(reducer, /* preloadedState, */enhancer);

class TripsApp extends Component {

  componentDidMount() {
    this.props.onLoad();
  }

  render() {
    return (
      <Grid>
        <Row>
          <Col sm={12}>
            {this.props.mode === actions.MODE_LIST
              ? <TripList />
              : (this.props.mode === actions.MODE_FORM_ADD
                ? <TripForm isNew={true} onSave={this.props.onAdd} />
                : <TripForm isNew={false} onSave={this.props.onEdit} />)}
          </Col>
        </Row>
      </Grid>
    );
  }

}

const mapStateToProps = (state) => {
  return {
    mode: state.mode
  }
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
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(TripsApp);
