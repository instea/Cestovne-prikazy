import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LeavesCalendarComponent } from './leaves-calendar.component';
import { CalendarComponent } from 'ng-fullcalendar';
import { ColorService, Color } from '../../services/color.service';
import { of } from 'rxjs/observable/of';

describe('LeavesCalendarComponent', () => {
  let component: LeavesCalendarComponent;
  let fixture: ComponentFixture<LeavesCalendarComponent>;

  beforeEach(
    async(() => {
      const mockService = {
        getColor: value => new Color(0, 0, 0),
      };
      TestBed.configureTestingModule({
        declarations: [LeavesCalendarComponent, CalendarComponent],
        providers: [{ provide: ColorService, useValue: mockService }],
      }).compileComponents();
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(LeavesCalendarComponent);
    component = fixture.componentInstance;
    component.leaves = of([]);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
