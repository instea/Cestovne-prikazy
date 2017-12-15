import { Leave, LeaveState } from './../leave';
import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Options } from 'fullcalendar';
import { CalendarComponent } from 'ng-fullcalendar';
import { Moment } from 'moment';
import * as moment from 'moment';
import { ColorService } from '../../services/color.service';

@Component({
  selector: 'app-leaves-calendar',
  templateUrl: './leaves-calendar.component.html',
  styleUrls: ['./leaves-calendar.component.scss']
})
export class LeavesCalendarComponent implements OnInit {

  calendarOptions: Options;
  @Input() leaves: Observable<Leave[]>;
  @ViewChild(CalendarComponent) ucCalendar: CalendarComponent;

  constructor(private colorService: ColorService) {}

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
    this.leaves.subscribe(leaves => {
      console.log(leaves);
      const events = leaves
        .filter(leave => leave.state !== LeaveState.REJECTED)
        .map((leave) => toEvent(leave, this.colorService));
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

const generateColor = (leave: Leave, colorService: ColorService): string => {
  const opacity = leave.state === LeaveState.APPROVED
    ? 1
    : 0.5;
  const baseColor = colorService.getColor(leave.requester.username);
  baseColor.a = opacity;
  return baseColor.toString();
};

const dateToStr = (
  m: Date,
  modifier: (_m: Moment) => Moment = _m => _m
): string => modifier(moment(m)).format('YYYY-MM-DD');

function toEvent(leave: Leave, colorService: ColorService) {
  return {
    title: leave.requester.getFullName(),
    allDay: !leave.isHalfDay,
    start: dateToStr(leave.startDate),
    end: dateToStr(leave.endDate, (_m) => _m.add(1, 'day')),
    backgroundColor: generateColor(leave, colorService),
  };
}
