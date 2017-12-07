import { Apollo } from 'apollo-angular/Apollo';
import { Injectable } from '@angular/core';
import { Leave, fromGraphQl } from '../leaves/leave';
import { Component, OnInit } from '@angular/core';
import gql from 'graphql-tag';
import { Observable } from 'rxjs/Observable';

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
  }
}
`;

@Injectable()
export class LeavesService {

  constructor(private apollo: Apollo) { }


  addNewLeave(leave) {
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