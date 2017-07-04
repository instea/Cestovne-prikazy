import './TripsApp.css';

import {Grid, Row, Col} from 'react-bootstrap';
import React, { Component } from 'react';
import {connect} from 'react-redux';
import {createStore, combineReducers} from 'redux';
import * as actions from './dispatch/actions';

import TripList from './components/TripList';
import TripForm from './components/TripForm';

import * as reducers from './dispatch/reducers';

export const store = createStore(combineReducers({
  ...reducers
}));

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
              : <TripForm isNew={this.props.mode === actions.MODE_FORM_ADD} />}
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
    }
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(TripsApp);
