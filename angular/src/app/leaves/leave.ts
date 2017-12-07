export class Leave {
    id: string;
    startDate: Date;
    endDate: Date;
    type: LeaveType;
}

export function fromGraphQl(item: any): Leave {
    const model = new Leave()
    model.id = item.id;
    model.startDate = new Date(item.startDate)
    model.endDate = new Date(item.endDate)
    model.type = item.type ? LeaveType[<keyof typeof LeaveType>item.type] : LeaveType.ANNUAL
    return model
}

export enum LeaveType {
    ANNUAL,
    SICKNESS,
    MATERNITY,
    PARENTAL,
    CARING,
}