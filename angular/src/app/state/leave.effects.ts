import { LeavesService } from './../services/leaves.service';
import { ADD_LEAVE, APPROVE_LEAVE, REJECT_LEAVE } from './leaves';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/catch';
import { Injectable } from '@angular/core';
import { Http } from '@angular/http';
import { Observable } from 'rxjs/Observable';
import { Action } from '@ngrx/store';
import { Actions, Effect } from '@ngrx/effects';
import { of } from 'rxjs/observable/of';
import { go } from '@ngrx/router-store';

@Injectable()
export class LeavesEffects {
  @Effect()
  addLeave$: Observable<Action> = this.actions$
    .ofType(ADD_LEAVE)
    .switchMap(action => this.leaveService.addNewLeave(action.payload))
    .map(result => {
      console.log('mutation', result);
      return go('/list');
    });

  @Effect({ dispatch: false })
  approve$: Observable<any> = this.actions$
    .ofType(APPROVE_LEAVE)
    .switchMap(action => this.leaveService.approveLeave(action.payload));

  @Effect({ dispatch: false })
  reject$: Observable<any> = this.actions$
    .ofType(REJECT_LEAVE)
    .switchMap(action => this.leaveService.rejectLeave(action.payload));

  constructor(private leaveService: LeavesService, private actions$: Actions) {}
}
