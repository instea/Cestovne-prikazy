import { Apollo } from 'apollo-angular/Apollo';
import { Injectable } from '@angular/core';
import { Leave, LeaveState, fromGraphQl, LeaveType } from '../leaves/leave';
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

const removeMutation = gql`
  mutation removeLeaveMutation($id: ID!) {
    removeLeave(id: $id) {
      success
    }
  }
`;

const approveLeaveMutation = gql`
  mutation approveLeaveMutation($id: String!) {
    approveLeave(id: $id) {
      id
      state
      approver {
        id
        email
        firstName
        surname
      }
    }
  }
`;

const rejectLeaveMutation = gql`
  mutation rejectLeaveMutation($id: String!) {
    rejectLeave(id: $id) {
      id
      state
      approver {
        id
        email
        firstName
        surname
      }
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
      state
      isHalfDay
      numDays
      requester {
        id
        email
        firstName
        surname
      }
      approver {
        id
        email
        firstName
        surname
      }
    }
  }
`;

function isPending(leave: Leave): boolean {
  return leave.state === LeaveState.PENDING;
}

@Injectable()
export class LeavesService {
  constructor(private apollo: Apollo) {}

  addNewLeave(model: Leave) {
    const leave = {
      ...model,
      startDate: model.startDate.toISOString(),
      endDate: model.endDate.toISOString(),
      type: LeaveType[model.type],
    };
    console.log('addNewLeave', leave);
    return this.apollo.mutate({
      mutation: addLeaveMutation,
      variables: {
        leave,
      },
      refetchQueries: [{ query: LeavesQuery }],
    });
  }

  removeLeave(id: String) {
    console.log('removeLeave', id);
    return this.apollo.mutate({
      mutation: removeMutation,
      variables: {
        id,
      },
      refetchQueries: [{ query: LeavesQuery }],
    });
  }

  approveLeave(leave: Leave) {
    console.log('approveLeave', leave);
    return this.apollo.mutate({
      mutation: approveLeaveMutation,
      variables: { id: leave.id },
    });
  }

  rejectLeave(leave: Leave) {
    console.log('rejectLeave', leave);
    return this.apollo.mutate({
      mutation: rejectLeaveMutation,
      variables: { id: leave.id },
    });
  }

  getLeaves() {
    return this.apollo
      .watchQuery<any>({ query: LeavesQuery })
      .valueChanges.map(({ data }) => toLeaves(data.getLeaves));
  }

  getPendingLeaves() {
    return this.getLeaves().map(leaves => leaves.filter(isPending));
  }
}

function toLeaves(items: any[]): Leave[] {
  if (!items) {
    return [];
  }
  const models = items.map(fromGraphQl);
  return models;
}
