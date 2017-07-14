import * as Place from '../data/Place';

export const ADD_PLACE = 'ADD_PLACE';
export const EDIT_PLACE = 'EDIT_PLACE';

export function addPlace(place, mutate) {
  return (dispatch) => {
    mutate({
      variables: {
        place: Place.fullToSerializable(place)
      }
    }).then(() => dispatch({
      type: ADD_PLACE,
      place: place
    }));
  };
}

export function editPlace(place, id, mutate) {
  mutate({
    variables: {
      id: id,
      place: Place.fullToSerializable(place)
    }
  });
  return ({
    type: EDIT_PLACE,
    place: place
  });
}
