import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LeavesCalendarComponent } from './leaves-calendar.component';
import { CalendarComponent } from 'ng-fullcalendar';
import { ColorService } from '../../services/color.service';

describe('LeavesCalendarComponent', () => {
  let component: LeavesCalendarComponent;
  let fixture: ComponentFixture<LeavesCalendarComponent>;

  beforeEach(
    async(() => {
      TestBed.configureTestingModule({
        declarations: [LeavesCalendarComponent, CalendarComponent]
      }).compileComponents();
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(LeavesCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
