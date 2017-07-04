import uuid from 'uuid';
import moment from 'moment';
import {Record} from 'immutable';

const Trip = Record({
   id: '',
   from: moment(),
   to: moment(),
   place: ''
});

export function emptyTrip() {
   return new Trip({
      id: uuid.v4()
   });
};

export default Trip;
