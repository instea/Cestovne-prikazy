import { Leave, LeaveState } from './../leave';
import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Options } from 'fullcalendar';
import { CalendarComponent } from 'ng-fullcalendar';
import { Moment } from 'moment';
import * as moment from 'moment';

@Component({
  selector: 'app-leaves-calendar',
  templateUrl: './leaves-calendar.component.html',
  styleUrls: ['./leaves-calendar.component.scss']
})
export class LeavesCalendarComponent implements OnInit {
  calendarOptions: Options;
  @Input() leaves: Observable<Leave[]>;
  @ViewChild(CalendarComponent) ucCalendar: CalendarComponent;

  constructor() {}

  ngOnInit() {
    this.calendarOptions = {
      editable: false,
      eventLimit: false,
      header: {
        left: 'prev,next today',
        center: 'title',
        right: ''
      },
      events: []
    };
    this.leaves.subscribe(ls => {
      console.log(ls);
      const events = ls
        .filter(l => l.state !== LeaveState.REJECTED)
        .map(toEvent);
      this.calendarOptions = {
        ...this.calendarOptions,
        events
      };
      console.log(this.calendarOptions.events);
      this.refreshEvents();
    });
  }

  refreshEvents() {
    // hack
    const isInitialized =
      this.ucCalendar.options && !!this.ucCalendar.options.eventDrop;
    if (!isInitialized) {
      return;
    }

    this.ucCalendar.fullCalendar('removeEvents');
    this.calendarOptions.events.forEach(e =>
      this.ucCalendar.fullCalendar('renderEvent', e)
    );
    this.ucCalendar.fullCalendar('rerenderEvents');
  }
}

// TODO - replace by real generation
const generateColor = (leave: Leave): string => {
  const opacity = leave.state === LeaveState.APPROVED ? 1 : 0.5;
  return `rgba(220,220,0,${opacity})`;
};

const dateToStr = (
  m: Date,
  modifier: (_m: Moment) => Moment = _m => _m
): string => modifier(moment(m)).format('YYYY-MM-DD');

function toEvent(l: Leave) {
  return {
    title: l.requester.getFullName(),
    allDay: !l.isHalfDay,
    start: dateToStr(l.startDate),
    end: dateToStr(l.endDate, _m => _m.add(1, 'day')),
    backgroundColor: generateColor(l)
  };
}
