export class User {
  id: string;
  email: string;
  firstName: string;
  surname: string;

  getFullName() {
    return this.firstName + ' ' + this.surname;
  }
}

export function fromGraphQl(item: any): User {
  const model = new User();
  model.id = item.id;
  model.email = item.email;
  model.firstName = item.firstName;
  model.surname = item.surname;
  return model;
}
