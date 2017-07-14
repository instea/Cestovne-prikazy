import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../../actions/placeActions';
import PlaceForm from './PlaceForm';

class AddPlaceForm extends Component {

  render() {
    return (
      <PlaceForm header="Add place" onSave={this.props.onSave} />
    );
  }

}

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onSave: (place) => {
    dispatch(actions.addPlace(place));
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(AddPlaceForm);
