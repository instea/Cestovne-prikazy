import { User, fromGraphQl as fromUser } from './../login-page/user';

export enum LeaveType {
  ANNUAL,
  SICKNESS,
  MATERNITY,
  PARENTAL,
  CARING
}

export enum LeaveState {
  PENDING,
  APPROVED,
  REJECTED
}

export class Leave {
  id: string;
  startDate: Date;
  endDate: Date;
  type: LeaveType;
  state: LeaveState;
  requester?: User;
  approver?: User;
  isHalfDay?: boolean;
}

export function fromGraphQl(item: any): Leave {
  const model = new Leave();
  model.id = item.id;
  model.startDate = new Date(item.startDate);
  model.endDate = new Date(item.endDate);
  model.type = item.type
    ? LeaveType[<keyof typeof LeaveType>item.type]
    : LeaveType.ANNUAL;
  model.requester = fromUser(item.requester);
  model.approver = item.approver && fromUser(item.approver);
  model.state = item.state
    ? LeaveState[<keyof typeof LeaveState>item.state]
    : LeaveState.PENDING;
  model.isHalfDay = item.isHalfDay;
  return model;
}
