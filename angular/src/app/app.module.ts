import { LeavesService } from './services/leaves.service';
import { LeavesEffects } from './state/leave.effects';
import { AutologinAction } from './state/auth';
import { GRAPHQL_URL } from './constants';
import { getJwt } from './state/selectors';
import { AuthEffects } from './state/auth.effects';
import { INITIAL_STATE, reducerDefinitions, AppState } from './state/root';
import { StoreModule, Store } from '@ngrx/store';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule, HttpHeaders } from '@angular/common/http';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ApolloModule } from 'apollo-angular';
import { HttpLinkModule } from 'apollo-angular-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { EffectsModule } from '@ngrx/effects';
import { ReactiveFormsModule } from '@angular/forms';
import { CalendarModule } from 'primeng/primeng';

import { AppComponent } from './app.component';
import { Apollo } from 'apollo-angular/Apollo';
import { HttpLink } from 'apollo-angular-link-http/HttpLink';
import { setContext } from 'apollo-link-context';
import { AppRoutingModule } from './app-routing.module';
import { RouterStoreModule } from '@ngrx/router-store';
import { LoginPageComponent } from './login-page/login-page.component';
import { LeavesListComponent } from './leaves/leaves-list/leaves-list.component';
import { AuthService } from './auth.service';
import { NavHeaderComponent } from './nav-header/nav-header.component';
import { LeavesApprovalComponent } from './leaves/leaves-approval/leaves-approval.component';
import { tokenKey } from '@angular/core/src/view/util';
import { LeavesAddComponent } from './leaves/leaves-add/leaves-add.component';
import { ValidationErrorsComponent } from './components/validation-errors/validation-errors.component';
import { HolidayCountService } from './services/holiday-count.service';
import { TranslateLeaveStatePipe } from './pipes/translate-leave-state.pipe';
import { TranslateLeaveTypePipe } from './pipes/translate-leave-type.pipe';

@NgModule({
  declarations: [
    AppComponent,
    LoginPageComponent,
    LeavesListComponent,
    NavHeaderComponent,
    LeavesApprovalComponent,
    LeavesAddComponent,
    ValidationErrorsComponent,
    TranslateLeaveStatePipe,
    TranslateLeaveTypePipe,
  ],
  imports: [
    BrowserModule,
    NgbModule.forRoot(),
    HttpClientModule,
    ApolloModule,
    HttpLinkModule,
    AppRoutingModule,
    StoreModule.provideStore(reducerDefinitions, INITIAL_STATE),
    StoreDevtoolsModule.instrumentOnlyWithExtension({
      maxAge: 50,
    }),
    RouterStoreModule.connectRouter(),
    ReactiveFormsModule,
    EffectsModule.run(AuthEffects),
    EffectsModule.run(LeavesEffects),
    CalendarModule,
  ],
  providers: [AuthService, LeavesService, HolidayCountService],
  bootstrap: [AppComponent],
})
export class AppModule {
  private jwt?: string;

  constructor(apollo: Apollo, httpLink: HttpLink, store: Store<AppState>) {
    // Watch changes in login state
    getJwt(store).subscribe(jwt => (this.jwt = jwt));

    // Initialize Apollo
    const http = httpLink.create({
      uri: GRAPHQL_URL,
    });

    const auth = setContext(() => {
      return this.jwt
        ? {
            headers: new HttpHeaders({
              Authorization: `Bearer ${this.jwt}`,
            }),
          }
        : {};
    });

    apollo.create({
      link: auth.concat(http),
      cache: new InMemoryCache(),
    });

    // Trigger "asynchronous" initial procedures
    store.dispatch(new AutologinAction());
  }
}
