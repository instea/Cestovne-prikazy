import _ from 'lodash';

export function custom(values, predicate, msg, ...fields) {
  return _.fromPairs(
    fields
      .map(field => predicate(values[field]) ? undefined : [field, msg])
      .filter(val => !!val)
  );
}

export const inlineRequired = (val) => R_PREDICATE(val) ? undefined : R_MESSAGE;

const R_PREDICATE = (val) => !!val || val === 0;
const R_MESSAGE = 'Required';
export const required = (values, ...fields) => custom(values, R_PREDICATE, R_MESSAGE, ...fields);

const ML_PREDICATE = (length) => ((val) => !val || val.length < length);
const ML_MESSAGE = (length) => `Must be at least ${length} characters long`;
export const minLength = (values, length, ...fields) => custom(values, ML_PREDICATE(length), ML_MESSAGE(length), ...fields);
