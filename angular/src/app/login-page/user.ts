export class User {
    id: string;
    username: string;
    firstName: string;
    surname: string;

    getFullName() {
        return this.firstName + ' ' + this.surname;
    }
}

export function fromGraphQl(item: any): User {
    const model = new User();
    model.id = item.id;
    model.username = item.username;
    model.firstName = item.firstName;
    model.surname = item.surname;
    return model;
}
