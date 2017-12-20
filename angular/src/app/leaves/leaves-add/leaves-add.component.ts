import { Leave, LeaveType } from './../leave';
import { AddLeave } from './../../state/leaves';
import { AppState } from './../../state/root';
import { Store } from '@ngrx/store';
import { FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Component, OnInit } from '@angular/core';
import { HolidayCountService } from '../../services/holiday-count.service';

export interface SelectOption {
  value: any;
  label: string;
}

@Component({
  selector: 'app-leaves-add',
  templateUrl: './leaves-add.component.html',
  styleUrls: ['./leaves-add.component.scss'],
})
export class LeavesAddComponent implements OnInit {
  addGroup: FormGroup;
  enumTypes: SelectOption[];

  constructor(
    fb: FormBuilder,
    private store: Store<AppState>,
    public holidayCountService: HolidayCountService
  ) {
    const today = getStartOfDay();
    this.addGroup = fb.group(
      {
        startDate: [today, Validators.required],
        endDate: [today, Validators.required],
        type: [LeaveType.ANNUAL],
        isHalfDay: [false],
      },
      { validator: this.validateDates }
    );
    this.enumTypes = enumerateTypes();
  }

  ngOnInit() {
    this.startDate.valueChanges.subscribe(newDate => {
      // if end date was not changed, update it with start date automatically
      if (!this.endDate.dirty) {
        this.endDate.setValue(newDate);
      }
    });
  }

  computeNumWorkDays() {
    const { value: leave } = this.addGroup;
    return this.holidayCountService.numWorkDays(leave);
  }

  onSubmit() {
    console.log('on submit', this.addGroup.value);
    const { value } = this.addGroup;
    const leave: Leave = {
      ...value,
      type: +value.type,
      numDays: this.computeNumWorkDays(),
    };
    this.store.dispatch(new AddLeave(leave));
  }

  validateDates(group: FormGroup) {
    const sd = group.get('startDate');
    const ed = group.get('endDate');
    const halfDay = group.get('isHalfDay');
    const errors: any = {};
    if (ed.value < sd.value) {
      errors.validateDateOrder = true;
    }
    if (halfDay.value && ed.value.getTime() !== sd.value.getTime()) {
      errors.validateHalfDay = true;
    }
    return errors;
  }

  get startDate() {
    return this.addGroup.get('startDate');
  }
  get endDate() {
    return this.addGroup.get('endDate');
  }
}

function getStartOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function enumerateTypes() {
  const objValues = Object.keys(LeaveType).map(k => LeaveType[k]);
  const values = objValues.filter(v => typeof v === 'number') as number[];
  return values.map(value => ({ value, label: LeaveType[value] }));
}
