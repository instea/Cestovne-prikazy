import { CalendarModule } from 'primeng/primeng';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { mockStoreModule } from '../../mocks/store.mock';

import { LeavesAddComponent } from './leaves-add.component';
import { HolidayCountService } from '../../services/holiday-count.service';
import { of } from 'rxjs/observable/of';

describe('LeavesAddComponent', () => {
  let component: LeavesAddComponent;
  let fixture: ComponentFixture<LeavesAddComponent>;

  beforeEach(
    async(() => {
      const mockService = {
        numWorkDays: leave => of(0),
      };
      TestBed.configureTestingModule({
        declarations: [LeavesAddComponent],
        imports: [
          BrowserModule,
          BrowserAnimationsModule,
          ReactiveFormsModule,
          CalendarModule,
          mockStoreModule(),
        ],
        schemas: [NO_ERRORS_SCHEMA],
        providers: [{ provide: HolidayCountService, useValue: mockService }],
      }).compileComponents();
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(LeavesAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
