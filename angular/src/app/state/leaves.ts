import { Leave } from './../leaves/leave';
import { Action } from '@ngrx/store';

export const ADD_LEAVE = 'ADD_LEAVE';
export const APPROVE_LEAVE = 'APPROVE_LEAVE';
export const REJECT_LEAVE = 'REJECT_LEAVE';
export const FILTER_LEAVES = 'FILTER_LEAVES';
export const CLEAR_LEAVES_FILTER = 'CLEAR_LEAVES_FILTER';
export const SET_LEAVE_VIEW = 'SET_LEAVE_VIEW';
export const GENERATE_EXPORT = 'GENERATE_EXPORT';
export const EXPORT_GENERARED = 'EXPORT_GENERARED';

export interface LeaveListFilter {
  requesterIds?: string[];
  months?: number[];
  years?: number[];
}

export type LeaveView = 'list' | 'calendar';

export interface LeavesState {
  leaveListFilter?: LeaveListFilter;
  view: LeaveView;
}

export interface ExportPayload {
  userId: string;
  month: Date;
}

export const LEAVES_INITIAL_STATE: LeavesState = {
  leaveListFilter: {
    requesterIds: [],
    months: [],
    years: [],
  },
  view: 'list',
};

export function leavesReducer(state: LeavesState, action: Action) {
  switch (action.type) {
    case FILTER_LEAVES:
      return {
        ...state,
        leaveListFilter: action.payload,
      };
    case SET_LEAVE_VIEW:
      return {
        ...state,
        view: action.payload,
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

export class SetLeaveView implements Action {
  readonly type = SET_LEAVE_VIEW;
  constructor(public readonly payload: LeaveView) {}
}

export class GenerateExport implements Action {
  readonly type = GENERATE_EXPORT;
  constructor(public readonly payload: ExportPayload) {}
}

export class ExportGenerated implements Action {
  readonly type = EXPORT_GENERARED;
  // payload is URL
  constructor(public readonly payload: string) {}
}

export type LeavesAction =
  | AddLeave
  | ApproveLeave
  | RejectLeave
  | SetLeaveView
  | GenerateExport
  | ExportGenerated;
