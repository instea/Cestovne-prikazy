import { JWL_LOCAL_STORAGE_NAME, LoginInfo } from './state/auth';
import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular/Apollo';
import { Observable } from 'rxjs/Observable';
import gql from 'graphql-tag';

const LOGIN_MUTATE = gql`
  mutation ($user: Credentials) {
    loginUser(user: $user) {
      success,
      message,
      payload
    }
  }
`;

@Injectable()
export class AuthService {

  constructor(
    private apollo: Apollo
  ) { }

  loginUser(loginInfo: LoginInfo): Observable<string> {
    return this.apollo.mutate({
      mutation: LOGIN_MUTATE,
      variables: {
        user: loginInfo
      }
    }).map(({ data, errors }) => {
      if (errors) {
        return Observable.throw(errors);
      }
      const res = data.loginUser;
      if (!res.success) {
        return Observable.throw(res.message);
      }
      localStorage.setItem(JWL_LOCAL_STORAGE_NAME, res.payload);
      return res.payload;
    });
  }
  
  logoutUser() {
    localStorage.removeItem(JWL_LOCAL_STORAGE_NAME);
  }

}
