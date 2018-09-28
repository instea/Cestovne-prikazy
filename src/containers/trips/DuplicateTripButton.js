import React from 'react';
import { compose } from 'redux';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button
} from 'react-bootstrap';
import * as actions from '../../actions/tripActions';
import { connect } from 'react-redux';
import { withStateHandlers, withProps, withHandlers } from 'recompose';
import { reduxForm, Field } from 'redux-form';
import { ReduxFormDatetime } from '../../components/FormHelpers';
import moment from 'moment';

const DuplicateTripModal = ({ isOpen, setClosed, complete }) => (
  <Modal show={isOpen} onHide={setClosed}>
    <ModalHeader>Duplicate trip</ModalHeader>
    <ModalBody>
      <Field
        name="departureTime"
        label="Time of departure:"
        id="departureTime"
        component={ReduxFormDatetime}
      />
    </ModalBody>
    <ModalFooter>
      <Button onClick={setClosed}>Cancel</Button>
      <Button bsStyle="primary" onClick={complete}>
        Duplicate
      </Button>
    </ModalFooter>
  </Modal>
);

const DuplicateTripButton = ({ isOpen, setOpen, setClosed, handleSubmit }) => (
  <Button bsStyle="info" onClick={e => setOpen()}>
    Duplicate
    <DuplicateTripModal
      isOpen={isOpen}
      setClosed={setClosed}
      complete={handleSubmit}
    />
  </Button>
);

const mapDispatchToProps = {
  duplicateTrip: actions.duplicateTrip
};

export default compose(
  connect(
    undefined,
    mapDispatchToProps
  ),
  withStateHandlers(() => ({ isOpen: false }), {
    setOpen: () => () => ({ isOpen: true }),
    setClosed: () => () => ({ isOpen: false })
  }),
  withProps(({ trip }) => ({
    initialValues: {
      departureTime: moment(trip.departureTime)
    }
  })),
  withHandlers({
    onSubmit: ({ trip: { id, ...trip }, duplicateTrip }) => values => {
      const duration = moment(trip.arrivalTime).diff(trip.departureTime);
      const departureTime = values.departureTime;
      const arrivalTime = departureTime.clone().add(duration, 'ms');

      duplicateTrip({
        ...trip,
        departureTime,
        arrivalTime
      });
    }
  }),
  reduxForm({
    form: 'duplicate-trip'
  })
)(DuplicateTripButton);
