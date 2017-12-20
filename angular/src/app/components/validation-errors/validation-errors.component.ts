import { Component, OnInit, Input } from '@angular/core';
import { ValidationErrors } from '@angular/forms';

const MSG = {
  validateDateOrder: 'Start date must not be greater than end date',
  validateHalfDay: 'Half day option is allowed only within single day',
};

@Component({
  selector: 'app-validation-errors',
  templateUrl: './validation-errors.component.html',
  styleUrls: ['./validation-errors.component.scss'],
})
export class ValidationErrorsComponent implements OnInit {
  @Input() errors: ValidationErrors;

  constructor() {}

  ngOnInit() {}

  getErrors(): { text: string }[] {
    const result = Object.keys(this.errors).map(k => ({
      text: MSG[k] || `${k} failed`,
    }));
    return result;
  }
}
