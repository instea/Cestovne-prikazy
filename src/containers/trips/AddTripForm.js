import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../../actions/tripActions';
import TripForm from './TripForm';
import moment from 'moment';
import * as TravelType from '../../data/TravelType';
import {bindActionCreators} from 'redux';

class AddTripForm extends Component {

  render() {
    return (
      <TripForm header="Add trip" onSave={this.props.onSave} initialValues={this.props.initialValues} />
    );
  }

}

const mapStateToProps = (state) => ({
  initialValues: {
    departureTime: moment().add(1, 'days').hours(8).minutes(0).seconds(0),
    arrivalTime: moment().add(1, 'days').hours(17).minutes(0).seconds(0),
    travelType: TravelType.values[0].code
  }
});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSave: (trip) => actions.addTrip(trip)
}, dispatch);

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(AddTripForm);
