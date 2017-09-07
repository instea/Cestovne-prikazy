import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../../actions/placeActions';
import PlaceForm from './PlaceForm';
import {bindActionCreators} from 'redux';

class AddPlaceForm extends Component {

  render() {
    return (
      <PlaceForm header="Add place" onSave={this.props.onSave} initialValues={{country: 'SK'}} />
    );
  }

}

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSave: (place) => actions.addPlace(place)
}, dispatch);

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(AddPlaceForm);
