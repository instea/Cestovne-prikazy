import { Leave, LeaveType } from './../leave';
import { AddLeave } from './../../state/leaves';
import { AppState } from './../../state/root';
import { Store } from '@ngrx/store';
import { FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Component, OnInit } from '@angular/core';
import { HolidayCountService } from '../../services/holiday-count.service';

@Component({
  selector: 'app-leaves-add',
  templateUrl: './leaves-add.component.html',
  styleUrls: ['./leaves-add.component.scss']
})
export class LeavesAddComponent implements OnInit {
  addGroup: FormGroup;

  constructor(
    fb: FormBuilder,
    private store: Store<AppState>,
    public holidayCountService: HolidayCountService
  ) {
    this.addGroup = fb.group(
      {
        startDate: [new Date(), Validators.required],
        endDate: [new Date(), Validators.required],
        type: [LeaveType.ANNUAL],
        isHalfDay: [false]
      },
      { validator: this.validateDates }
    );
  }

  ngOnInit() {}

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
      numDays: this.computeNumWorkDays()
    };
    this.store.dispatch(new AddLeave(leave));
  }

  enumTypes(): any[] {
    const objValues = Object.keys(LeaveType).map(k => LeaveType[k]);
    const values = objValues.filter(v => typeof v === 'number') as number[];
    return values.map(value => ({ value, label: LeaveType[value] }));
  }

  validateDates(group: FormGroup) {
    const sd = group.get('startDate');
    const ed = group.get('endDate');

    if (ed.value < sd.value) {
      return { validateDateOrder: true };
    }
    return null;
  }

  get startDate() {
    return this.addGroup.get('startDate');
  }
  get endDate() {
    return this.addGroup.get('endDate');
  }
}
