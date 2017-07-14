import React from 'react';
import {Row, Col, FormGroup, FormControl, ControlLabel, HelpBlock, Checkbox} from 'react-bootstrap';
import Datetime from 'react-datetime';
import 'react-datetime/css/react-datetime.css';
import moment from 'moment';

export const required = (val) => !val && 'Required';
export const minlength3 = (val) => val && val.length < 3 && 'Must be at least 3 characters long';

export const FieldWrapper = (field) => (
  <Row>
    <FormGroup controlId={"fc" + field.id} validationState={field.meta.touched && field.meta.error ? "error" : undefined}>
      <Col componentClass={ControlLabel} xs={4} sm={3} smOffset={0} md={2} mdOffset={2}>
        {field.label}
      </Col>
      <Col xs={8} sm={9} md={6}>
        {field.children}
        {field.meta.touched && field.meta.error && <HelpBlock>{field.meta.error}</HelpBlock>}
      </Col>
    </FormGroup>
  </Row>
);

export const ReduxFormInput = (field) => (
  <FieldWrapper {...field}>
    <FormControl {...field.input} {...field.optional} />
  </FieldWrapper>
);

export const ReduxFormSelect = (field) => (
  <FieldWrapper {...field}>
    <FormControl componentClass="select" {...field.input} {...field.optional}>
      {(field.options || []).map(opt => (
        <option value={opt.value} key={opt.value}>{opt.label}</option>
      ))}
    </FormControl>
  </FieldWrapper>
);

export const ReduxFormCheckbox = (field) => {
  const val = !!field.input.value;
  return (
    <FieldWrapper {...field}>
      <Checkbox {...field.input} {...field.optional} checked={val} value={true} />
    </FieldWrapper>
  );
};

export const timeToStr = (date) => {
  return moment(date).format('D. M. YYYY H:mm');
};

export const dateToStr = (date) => {
  return moment(date).format('D. M. YYYY');
};

export const ReduxFormDatetime = (field) => (
  <FieldWrapper {...field}>
    <Datetime {...field.input} {...field.optional} dateFormat="D. M. YYYY" timeFormat="H:mm" />
  </FieldWrapper>
);

const f = `H[h] mm[m]`;

export const durationToStr = (val) => {
  const m = moment().hours((val && val.hours()) || 0).minutes((val && val.minutes()) || 0);
  return m.format(f);
};

const normDur = (func) => {
  return (e) => {
    return func(moment.duration(parseFloat(e.target.value), 'minutes'));
  };
};
export const ReduxFormDuration = (field) => (
  <FieldWrapper {...field}>
    <FormControl type="range" min={0} max={60 * 24} step={15}
      value={field.input.value.asMinutes()}
      onChange={normDur(field.input.onChange)}
      onBlur={normDur(field.input.onBlur)} />
    {durationToStr(field.input.value)}
  </FieldWrapper>
);
