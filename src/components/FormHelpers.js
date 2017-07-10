import React from 'react';
import {Row, Col, FormGroup, FormControl, ControlLabel, HelpBlock, Checkbox} from 'react-bootstrap';

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

export const ReduxFormCheckbox = (field) => {
  const val = !!field.input.value;
  return (
    <FieldWrapper {...field}>
      <Checkbox {...field.input} {...field.optional} checked={val} value={true} />
    </FieldWrapper>
  );
}
