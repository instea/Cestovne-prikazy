import gql from 'graphql-tag';
import { Apollo } from 'apollo-angular/Apollo';
import { ADD_LEAVE } from './leaves';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/catch';
import { Injectable } from '@angular/core';
import { Http } from '@angular/http';
import { Observable } from 'rxjs/Observable';
import { Action } from '@ngrx/store';
import { Actions, Effect } from '@ngrx/effects';
import { of } from 'rxjs/observable/of';
import { go } from '@ngrx/router-store';

const addLeaveMutation = gql`
mutation addLeaveMutation($leave: LeaveInput) {
    createLeave(leave: $leave) {
        id
  }
}
`;


@Injectable()
export class LeavesEffects {
    @Effect() login$: Observable<Action> = this.actions$.ofType(ADD_LEAVE)
        .mergeMap(action =>
            this.apollo.mutate({
                mutation: addLeaveMutation,
                variables: {
                    leave: action.payload
                }
            })
        ).map(result => { console.log('mutation', result); return go('/list') })

    constructor(
        private apollo: Apollo,
        private actions$: Actions
    ) { }
}