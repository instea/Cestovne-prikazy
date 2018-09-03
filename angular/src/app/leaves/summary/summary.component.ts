import { Component, OnInit } from '@angular/core';
import { LeavesService } from '../../services/leaves.service';
import { Store } from '@ngrx/store';
import { AppState } from '../../state/root';
import 'rxjs/add/operator/map';
import { getUserInfo } from '../../state/selectors';
import { Observable } from 'rxjs/Observable';
import { Leave, LeaveType } from '../leave';
import { UserInfo } from '../../state/auth';
import { min, max, groupBy, rangeRight, values, sumBy } from 'lodash';
import * as moment from 'moment';
import { HolidayCountService } from '../../services/holiday-count.service';

type Summary = Array<{
  year: number;
  byType: Array<{
    type: string;
    count: number;
  }>;
}>;

@Component({
  selector: 'app-summary',
  templateUrl: './summary.component.html',
  styleUrls: ['./summary.component.scss'],
})
export class SummaryComponent implements OnInit {
  summary$: Observable<Summary>;

  constructor(
    private leaveService: LeavesService,
    private store: Store<AppState>,
    private holidayCountService: HolidayCountService
  ) {}

  ngOnInit() {
    const userInfo$ = getUserInfo(this.store);
    const leaves$ = this.leaveService.getLeaves();

    this.summary$ = Observable.combineLatest(
      leaves$,
      userInfo$,
      this.getGroupedMyLeaves
    );
  }

  getGroupedMyLeaves = (leaves: Array<Leave>, userInfo: UserInfo): Summary => {
    const myLeaves = leaves.filter(
      ({ requester }) => requester.id === userInfo.id
    );

    // Finding the year range
    const minYear = min(
      myLeaves.map(({ startDate }) => moment(startDate).year())
    );
    const maxYear = max(myLeaves.map(({ endDate }) => moment(endDate).year()));

    // Going throught all the years one by one
    return rangeRight(minYear, maxYear + 1).map(year => {
      // Filtering only those, that are in the current year
      const leavesInYear = myLeaves
        .filter(
          ({ startDate, endDate }) =>
            moment(startDate).year() <= year && moment(endDate).year() >= year
        )
        // Extracting only the part in the current year
        .map(leave => ({
          ...leave,
          startDate:
            moment(leave.startDate).year() === year
              ? leave.startDate
              : moment()
                  .year(year)
                  .startOf('year')
                  .toDate(),
          endDate:
            moment(leave.endDate).year() === year
              ? leave.endDate
              : moment()
                  .year(year)
                  .endOf('year')
                  .toDate(),
        }));

      // Grouping by type
      const byType = groupBy(leavesInYear, 'type');

      return {
        year,
        byType: values(byType).map(leavesOfType => ({
          type: LeaveType[leavesOfType[0].type],
          count: sumBy(leavesOfType, leave =>
            this.holidayCountService.numWorkDays(leave)
          ),
        })),
      };
    });
  };
}
