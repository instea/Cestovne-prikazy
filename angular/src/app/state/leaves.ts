import { Leave } from './../leaves/leave';
import { Action } from '@ngrx/store';

export const ADD_LEAVE = "ADD_LEAVE"

export interface LeavesState {
}

export const LEAVES_INITIAL_STATE: LeavesState = {
};

export function leavesReducer(state: LeavesState, action: LeavesAction) {
    return state;
}

export class AddLeave implements Action {
    readonly type = ADD_LEAVE;
    constructor(public readonly payload: Leave) { }
}

export type LeavesAction = AddLeave