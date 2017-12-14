import { Leave } from './../leave';
import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Options } from 'fullcalendar';
import { CalendarComponent } from 'ng-fullcalendar';

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
      editable: true,
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
      const events = ls.map(toEvent);
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
    const isInitialized = !!this.ucCalendar.options.eventDrop;
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

// we use local time
const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
const toStartStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toEndStr = (d: Date) => {
  const nextDay = new Date(d.getTime() + 25 * 3600 * 1000);
  return toStartStr(nextDay);
};

function toEvent(l: Leave) {
  return {
    title: l.requester.getFullName(),
    allDay: !l.isHalfDay,
    start: toStartStr(l.startDate),
    end: toEndStr(l.endDate)
  };
}
