import { JWL_LOCAL_STORAGE_NAME, LoginInfo, UserInfo } from './state/auth';
import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular/Apollo';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/throw';
import 'rxjs/add/operator/skipWhile';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/map';
import { of } from 'rxjs/observable/of';
import gql from 'graphql-tag';

const LOGIN_MUTATE = gql`
  mutation($user: Credentials) {
    loginUser(user: $user) {
      success
      message
      payload
    }
  }
`;

const GET_USER_INFO_QUERY = gql`
  query GetUserInfo {
    getUserInfo {
      id
      username
      firstName
      surname
      isAdmin
    }
  }
`;

@Injectable()
export class AuthService {
  jwt?: string;

  constructor(private apollo: Apollo) {}

  getUserInfo(): Observable<UserInfo> {
    return this.apollo
      .query({
        query: GET_USER_INFO_QUERY,
        fetchPolicy: 'network-only',
      })
      .skipWhile(({ loading }) => loading)
      .switchMap(({ data }) => {
        return of((<any>data).getUserInfo);
      });
  }

  loginUser(loginInfo: LoginInfo): Observable<string> {
    return this.apollo
      .mutate({
        mutation: LOGIN_MUTATE,
        variables: {
          user: loginInfo,
        },
      })
      .map(({ data, errors }) => {
        if (errors) {
          return Observable.throw(errors);
        }
        const res = data.loginUser;
        if (!res.success) {
          return Observable.throw(res.message);
        }
        return res.payload;
      });
  }

  afterLogin(jwt: string) {
    this.jwt = jwt;
    localStorage.setItem(JWL_LOCAL_STORAGE_NAME, jwt);
    // reset the store once apollo will use new JWT
    return this.apollo.getClient().resetStore();
  }

  logoutUser() {
    this.jwt = undefined;
    localStorage.removeItem(JWL_LOCAL_STORAGE_NAME);
    return this.apollo.getClient().resetStore();
  }

  getJwtToken() {
    return this.jwt;
  }
}
