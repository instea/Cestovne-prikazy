import { NgDatepickerModule } from 'ng2-datepicker';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { mockStoreModule } from '../../mocks/store.mock';

import { LeavesAddComponent } from './leaves-add.component';

describe('LeavesAddComponent', () => {
  let component: LeavesAddComponent;
  let fixture: ComponentFixture<LeavesAddComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [LeavesAddComponent],
      imports: [BrowserModule, ReactiveFormsModule, NgDatepickerModule, mockStoreModule()],
      schemas: [NO_ERRORS_SCHEMA]
    })
      .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LeavesAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
