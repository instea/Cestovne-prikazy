import React from 'react';
import {Row, Col, FormGroup, FormControl, ControlLabel, HelpBlock, Checkbox} from 'react-bootstrap';
import Datetime from 'react-datetime';
import 'react-datetime/css/react-datetime.css';
import MonthPicker from './MonthPicker';
import moment from 'moment';

export const reduxFormComponent = (InnerComponent) => {
  return ({id, meta, input, label, ...rest}) => (
    <Row>
      <FormGroup controlId={"fc" + id} validationState={meta.touched && meta.error ? "error" : undefined}>
        <Col componentClass={ControlLabel} xs={4} sm={3} smOffset={0} md={2} mdOffset={2}>
          {label}
        </Col>
        <Col xs={8} sm={9} md={6}>
          <InnerComponent {...input} {...rest} />
          {meta.touched && meta.error && <HelpBlock>{meta.error}</HelpBlock>}
        </Col>
      </FormGroup>
    </Row>
  );
};

export const ReduxFormInput = reduxFormComponent(FormControl);

export const ReduxFormSelect = reduxFormComponent(({options, ...rest}) => (
  <FormControl componentClass="select" {...rest}>
    {(options || []).map(opt => (
      <option value={opt.value} key={opt.value}>{opt.label}</option>
    ))}
  </FormControl>
));

export const ReduxFormCheckbox = reduxFormComponent((props) => (
  <Checkbox {...props} checked={!!props.value} value={true} />
));

export const timeToStr = (date) => {
  return moment(date).format('D. M. YYYY H:mm');
};

export const dateToStr = (date) => {
  return moment(date).format('D. M. YYYY');
};

export const ReduxFormDatetime = reduxFormComponent((props) => (
  <Datetime {...props} dateFormat="D. M. YYYY" timeFormat="H:mm" />
));

export const ReduxFormMonthPicker = reduxFormComponent((props) => (
  <MonthPicker {...props} />
));

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

export const ReduxFormDuration = reduxFormComponent((props) => (
  <div>
    {durationToStr(props.value)}
    <FormControl type="range" min={0} max={60 * 24} step={15}
      value={(props.value && props.value.asMinutes()) || 0}
      onChange={normDur(props.onChange)}
      onBlur={normDur(props.onBlur)} />
  </div>
));
