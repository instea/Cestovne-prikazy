import { Leave } from './../leaves/leave';
import { Action } from '@ngrx/store';

export const ADD_LEAVE = 'ADD_LEAVE';
export const APPROVE_LEAVE = 'APPROVE_LEAVE';
export const REJECT_LEAVE = 'REJECT_LEAVE';

export interface LeavesState {
  dummy?: any; // just to satisfy linter
}

export const LEAVES_INITIAL_STATE: LeavesState = {};

export function leavesReducer(state: LeavesState, action: LeavesAction) {
  return state;
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

export type LeavesAction = AddLeave;
