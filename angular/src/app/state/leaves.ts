import { Leave } from './../leaves/leave';
import { Action } from '@ngrx/store';

export const ADD_LEAVE = 'ADD_LEAVE';
export const APPROVE_LEAVE = 'APPROVE_LEAVE';
export const REJECT_LEAVE = 'REJECT_LEAVE';
export const SET_LEAVE_VIEW = 'SET_LEAVE_VIEW';

export type LeaveView = 'list' | 'calendar';

export interface LeavesState {
  view: LeaveView;
}

export const LEAVES_INITIAL_STATE: LeavesState = {
  view: 'list',
};

export function leavesReducer(state: LeavesState, action: LeavesAction) {
  switch (action.type) {
    case SET_LEAVE_VIEW:
      return {
        ...state,
        view: action.payload,
      };
    default:
      return state;
  }
}

export class AddLeave implements Action {
  readonly type = ADD_LEAVE;
  constructor(public readonly payload: Leave) {}
}

export class ApproveLeave implements Action {
  readonly type = APPROVE_LEAVE;
  constructor(public readonly payload: Leave) {}
}

export class RejectLeave implements Action {
  readonly type = REJECT_LEAVE;
  constructor(public readonly payload: Leave) {}
}

export class SetLeaveView implements Action {
  readonly type = SET_LEAVE_VIEW;
  constructor(public readonly payload: LeaveView) {}
}

export type LeavesAction = AddLeave | ApproveLeave | RejectLeave | SetLeaveView;
