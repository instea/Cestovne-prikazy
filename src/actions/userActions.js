export const ADD_USER = 'ADD_USER';
export const EDIT_USER = 'EDIT_USER';

export function addUser(user, mutate) {
  return (dispatch) => {
    mutate({
      variables: {
        user: user
      }
    }).then(() => dispatch({
      type: ADD_USER,
      user: user
    }));
  };
}

export function editUser(user, id, mutate) {
  mutate({
    variables: {
      id: id,
      user: user
    }
  });
  return ({
    type: EDIT_USER,
    user: user
  });
}
