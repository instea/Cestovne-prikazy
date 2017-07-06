import uuid from 'uuid';
import moment from 'moment';
import {Record} from 'immutable';

const Trip = Record({
   id: '',
   from: moment().add(27, 'hours'),
   to: moment().add(29, 'hours'),
   place: ''
});

export function emptyTrip() {
   return new Trip({
      id: uuid.v4()
   });
};

export default Trip;
