import React, {Component} from 'react';
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
    <FormControl type={field.type} {...field.input} {...field.optional} />
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

const f = (delim) => `H${delim}[h] mm${delim}[m]`;

export const strToDuration = (val, delim = '') => {
  const m = moment(val || '0h 0m', f(delim));
  return moment.duration(m.hours(), 'hours').add(m.minutes(), 'minutes');
};

export const durationToStr = (val, delim = '') => {
  const m = moment().hours((val && val.hours()) || 0).minutes((val && val.minutes()) || 0);
  return m.format(f(delim));
};

export class ReduxFormDuration extends Component {

  constructor(props) {
    super(props);
    this.state = {
      strValue: '',
      timeout: false
    };
  }

  updateValue() {
    this.props.input.onChange(strToDuration(this.state.strValue, ' '));
    this.setState({
      strValue: ''
    });
  }

  handleChange(e) {
    if (this.state.timeout) {
      clearTimeout(this.state.timeout);
    }

    this.setState({
      strValue: e.target.value,
      timeout: setTimeout(() => this.updateValue(), 500)
    });

  }

  render() {
    const field = this.props;
    return (
      <FieldWrapper {...field}>
        <FormControl type="text" value={this.state.strValue || durationToStr(field.input.value, ' ')} {...field.optional}
          onChange={(e) => this.handleChange(e)} onBlur={field.input.onBlur}/>
      </FieldWrapper>
    );
  }

}
