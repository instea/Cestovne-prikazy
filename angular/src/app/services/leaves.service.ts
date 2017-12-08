import { Apollo } from 'apollo-angular/Apollo';
import { Injectable } from '@angular/core';
import { Leave, fromGraphQl, LeaveType } from '../leaves/leave';
import { Component, OnInit } from '@angular/core';
import gql from 'graphql-tag';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';

const addLeaveMutation = gql`
mutation addLeaveMutation($leave: LeaveInput) {
    createLeave(leave: $leave) {
        id
  }
}
`;

const LeavesQuery = gql`
query LeavesQuery {
  getLeaves {
    id
    startDate
    endDate
    type
    requester {
      id
      username
      firstName
      surname
    }
  }
}
`;

@Injectable()
export class LeavesService {

  constructor(private apollo: Apollo) { }


  addNewLeave(model: Leave) {
    const leave = {
      ...model,
      startDate: model.startDate.toISOString(),
      endDate: model.endDate.toISOString(),
      type: LeaveType[model.type],
    }
    console.log('addNewLeave', leave);
    return this.apollo.mutate({
      mutation: addLeaveMutation,
      variables: {
        leave
      },
      refetchQueries: [{ query: LeavesQuery }],
    })
  }

  getLeaves() {
    return this.apollo.watchQuery<any>({ query: LeavesQuery }).valueChanges.map(({ data }) => toLeaves(data.getLeaves))
  }

}

function toLeaves(items: any[]): Leave[] {
  const models = items.map(fromGraphQl);
  return models;
}