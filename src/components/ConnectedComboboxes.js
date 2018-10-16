import {Combobox} from 'react-input-enhancements';
import React from 'react';
import {connect} from 'react-redux';
import {gql, graphql, compose} from 'react-apollo';
import withUser from './withUser';
import withProgress from './withProgress';
import {reduxFormComponent} from './FormHelpers';
import {FormControl} from 'react-bootstrap';

export const ComboboxWrapper = (props) => (
  <Combobox autocomplete onSelect={props.onChange} {...props} dropdownProps={{
    style: {
      display: 'block'
    }
  }}>
    {(inputProps, {matchingText, width}, registerInput) =>
      <FormControl type="text" autoComplete="off" inputRef={input => registerInput(input)} {...inputProps} />
    }
  </Combobox>
);

const dataGetter = (valueGetter, labelGetter, textGetter) => ((item) => ({
  value: valueGetter(item),
  label: labelGetter(item),
  text: textGetter ? textGetter(item) : labelGetter(item)
}));

const user_getData = dataGetter(user => user.id, user => `${user.surname}, ${user.firstName}`);
const _UserCombobox = (props) => {
  const data = props.users.map(user_getData);
  return <ComboboxWrapper options={data} {...props} />;
};

export const UserCombobox = compose(
  graphql(gql`
    query GetUsers {
      getUsers {
        id,
        firstName,
        surname
      }
    }
  `),
  withProgress({
    errorMessage: (error) => `Problem loading users: ${error.message}`,
    dataMappings: {
      users: 'getUsers'
    }
  }),
  withUser,
  connect((state, {users, isAdmin, userId}) => ({
    users: isAdmin
      ? users
      : users.filter(user => user.id === userId)
  }))
)(_UserCombobox);

export const ReduxFormUserCombobox = reduxFormComponent(UserCombobox);

const place_getData = dataGetter(place => place.id, place => `${place.destinationName} (${place.name})`);
const _PlaceCombobox = (props) => {
  const data = props.places.map(place_getData);
  return <ComboboxWrapper options={data} {...props} />;
};

export const PlaceCombobox = compose(
  graphql(gql`
    query GetPlaces {
      getPlaces {
        id,
        destinationName,
        name,
      }
    }
  `),
  withProgress({
    errorMessage: (error) => `Problem loading places: ${error.message}`,
    dataMappings: {
      places: 'getPlaces'
    }
  })
)(_PlaceCombobox);

export const ReduxFormPlaceCombobox = reduxFormComponent(PlaceCombobox);
