import { User, fromGraphQl as fromUser } from './../login-page/user';

export enum LeaveType {
  ANNUAL,
  SICKNESS,
  MATERNITY,
  PARENTAL,
  CARING
}

export class Leave {
  id: string;
  startDate: Date;
  endDate: Date;
  type: LeaveType;
  requester?: User;
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
  model.isHalfDay = item.isHalfDay;
  return model;
}
