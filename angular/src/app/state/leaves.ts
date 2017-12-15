import { Leave } from './../leaves/leave';
import { Action } from '@ngrx/store';

export const ADD_LEAVE = 'ADD_LEAVE';
export const APPROVE_LEAVE = 'APPROVE_LEAVE';
export const REJECT_LEAVE = 'REJECT_LEAVE';
export const FILTER_LEAVES = 'FILTER_LEAVES';
export const CLEAR_LEAVES_FILTER = 'CLEAR_LEAVES_FILTER';

export interface LeaveListFilter {
  requesterIds?: string[];
  months?: number[];
  years?: number[];
}

export interface LeavesState {
  leaveListFilter?: LeaveListFilter;
}

export const LEAVES_INITIAL_STATE: LeavesState = {
  leaveListFilter: {
    requesterIds: [],
    months: [],
    years: [],
  },
};

export function leavesReducer(state: LeavesState, action: Action) {
  switch (action.type) {
    case FILTER_LEAVES:
      return {
        ...state,
        leaveListFilter: action.payload,
      };
    case CLEAR_LEAVES_FILTER:
      return {
        ...state,
        leaveListFilter: LEAVES_INITIAL_STATE.leaveListFilter,
      };
    default:
      return state;
  }
}

export class AddLeave implements Action {
  readonly type = ADD_LEAVE;
  constructor(public readonly payload: Leave) {}
}

export class FilterLeaves implements Action {
  readonly type = FILTER_LEAVES;
  constructor(public readonly payload: LeaveListFilter) {}
}

export class ClearLeavesFilter implements Action {
  readonly type = CLEAR_LEAVES_FILTER;
}

export class ApproveLeave implements Action {
  readonly type = APPROVE_LEAVE;
  constructor(public readonly payload: Leave) {}
}

export class RejectLeave implements Action {
  readonly type = REJECT_LEAVE;
  constructor(public readonly payload: Leave) {}
}

export type LeavesAction = AddLeave;
