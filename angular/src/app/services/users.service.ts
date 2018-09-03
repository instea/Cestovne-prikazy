import { User, fromGraphQl } from './../login-page/user';
import { Apollo } from 'apollo-angular/Apollo';
import { Injectable } from '@angular/core';
import gql from 'graphql-tag';
import 'rxjs/add/operator/map';

const UsersQuery = gql`
  query UsersQuery {
    getUsers {
      id
      username
      firstName
      surname
    }
  }
`;

@Injectable()
export class UsersService {
  constructor(private apollo: Apollo) {}

  getUsers() {
    return this.apollo
      .watchQuery<any>({ query: UsersQuery })
      .valueChanges.map(({ data }) => toUsers(data.getUsers));
  }
}

function toUsers(items: any[]): User[] {
  if (!items) {
    return [];
  }
  return items.map(fromGraphQl);
}
