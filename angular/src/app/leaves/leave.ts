export class Leave {
    id: string;
    startDate: Date;
    endDate: Date;
}

export function fromGraphQl(item: any): Leave {
    const model = new Leave()
    model.id = item.id;
    model.startDate = new Date(item.startDate)
    model.endDate = new Date(item.endDate)
    return model
}