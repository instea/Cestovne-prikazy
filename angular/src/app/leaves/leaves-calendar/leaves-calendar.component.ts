import { Leave, LeaveState, LeaveType } from './../leave';
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
  styleUrls: ['./leaves-calendar.component.scss'],
})
export class LeavesCalendarComponent implements OnInit {
  calendarOptions: Options;
  @Input() leaves: Observable<Leave[]>;
  @ViewChild(CalendarComponent) ucCalendar: CalendarComponent;
  events: any[];

  constructor(private colorService: ColorService) {}

  ngOnInit() {
    this.calendarOptions = {
      editable: false,
      eventLimit: false,
      header: {
        left: 'prev,next today',
        center: 'title',
        right: '',
      },
      events: (start, end, timezone, callback) => {
        // return up-to-date events
        callback(this.events);
      },
    };
    this.leaves.subscribe(leaves => {
      console.log('calendar view leaves:', leaves);
      this.events = leaves
        .filter(leave => leave.state !== LeaveState.REJECTED)
        .map(leave => toEvent(leave, this.colorService));
      this.refreshEvents();
    });
  }

  refreshEvents() {
    // hack for initialization retrieval
    const isInitialized =
      this.ucCalendar.options && !!this.ucCalendar.options.eventDrop;
    if (!isInitialized) {
      return;
    }
    this.ucCalendar.fullCalendar('refetchEvents');
  }
}

const generateColor = (leave: Leave, colorService: ColorService): string => {
  const opacity = leave.state === LeaveState.APPROVED ? 1 : 0.5;
  const baseColor = colorService.getColor(leave.requester.username);
  baseColor.a = opacity;
  return baseColor.toString();
};

const dateToStr = (
  date: Date,
  modifier: (m: Moment) => Moment = m => m
): string => modifier(moment(date)).format('YYYY-MM-DD');

function getLeaveTypeShortLabel(leaveType: LeaveType) {
  return LeaveType[leaveType][0];
}

function getEventTitle(leave: Leave) {
  const requester = leave.requester.getFullName();
  const typeLabel = getLeaveTypeShortLabel(leave.type);
  const halfDayLabel = leave.isHalfDay ? '1/2 ' : '';
  return `${requester} ${halfDayLabel}(${typeLabel})`;
}

function toEvent(leave: Leave, colorService: ColorService) {
  return {
    title: getEventTitle(leave),
    allDay: true,
    start: dateToStr(leave.startDate),
    end: dateToStr(leave.endDate, m => m.add(1, 'day')),
    backgroundColor: generateColor(leave, colorService),
  };
}
