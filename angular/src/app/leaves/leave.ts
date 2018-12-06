import { User, fromGraphQl as fromUser } from './../login-page/user';

export enum LeaveType {
  ANNUAL,
  SICKNESS,
  DOCTOR,
  MATERNITY,
  PARENTAL,
  CARING,
}

export enum LeaveState {
  PENDING,
  APPROVED,
  REJECTED,
}

export interface Leave {
  id: string;
  startDate: Date;
  endDate: Date;
  type: LeaveType;
  state: LeaveState;
  requester?: User;
  approver?: User;
  isHalfDay?: boolean;
  numDays?: number;
}

export function fromGraphQl(item: any): Leave {
  return {
    id: item.id,
    startDate: new Date(item.startDate),
    endDate: new Date(item.endDate),
    type: item.type
      ? LeaveType[<keyof typeof LeaveType>item.type]
      : LeaveType.ANNUAL,
    requester: fromUser(item.requester),
    approver: item.approver && fromUser(item.approver),
    state: item.state
      ? LeaveState[<keyof typeof LeaveState>item.state]
      : LeaveState.PENDING,
    isHalfDay: item.isHalfDay,
    numDays: item.numDays,
  };
}
