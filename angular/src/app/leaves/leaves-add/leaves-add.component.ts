import { Leave } from './../leave';
import { AddLeave } from './../../state/leaves';
import { AppState } from './../../state/root';
import { Store } from '@ngrx/store';
import { FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-leaves-add',
  templateUrl: './leaves-add.component.html',
  styleUrls: ['./leaves-add.component.scss']
})
export class LeavesAddComponent implements OnInit {
  addGroup: FormGroup;

  constructor(fb: FormBuilder, private store: Store<AppState>) {
    this.addGroup = fb.group({
      startDate: [new Date(), Validators.required],
      endDate: [new Date(), Validators.required],
    });
  }

  ngOnInit() {
  }

  onSubmit() {
    console.log('on submit', this.addGroup.value);
    const { value } = this.addGroup
    const leave = new Leave();
    leave.startDate = value.startDate.toISOString();
    leave.endDate = value.endDate.toISOString();
    this.store.dispatch(new AddLeave(leave))
  }
}
