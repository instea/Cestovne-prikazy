import { List } from 'immutable';
import moment from 'moment';

import Trip from '../models/Trip';

export function loadData(callback) {
   let trips = List();
   try {
      trips = localStorage.trips && JSON.parse(localStorage.trips);
      if (!trips || !trips.length) {
         callback(List());
      } else {
         callback(List(trips.filter(trip => trip && trip.id).map(trip => new Trip({
            ...trip,
            from: moment(trip.from),
            to: moment(trip.to)
         }))));
      }
   } catch (e) {
      callback(List());
   }
}

export function saveData(data, callback) {
   localStorage.trips = JSON.stringify(data);
   callback && callback();
}
