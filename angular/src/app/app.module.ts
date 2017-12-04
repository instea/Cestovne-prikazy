import { AuthEffects } from './state/auth.effects';
import { INITIAL_STATE, reducerDefinitions } from './state/root';
import { StoreModule } from '@ngrx/store';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { ApolloModule } from 'apollo-angular';
import { HttpLinkModule } from 'apollo-angular-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { EffectsModule } from '@ngrx/effects';
import { ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { Apollo } from 'apollo-angular/Apollo';
import { HttpLink } from 'apollo-angular-link-http/HttpLink';
import { AppRoutingModule } from './app-routing.module';
import { RouterStoreModule } from '@ngrx/router-store';
import { LoginPageComponent } from './login-page/login-page.component';
import { LeavesListComponent } from './leaves/leaves-list/leaves-list.component';
import { AuthService } from './auth.service';


@NgModule({
  declarations: [
    AppComponent,
    LoginPageComponent,
    LeavesListComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    ApolloModule,
    HttpLinkModule,
    AppRoutingModule,
    StoreModule.provideStore(reducerDefinitions, INITIAL_STATE),
    StoreDevtoolsModule.instrumentOnlyWithExtension({
      maxAge: 5
    }),
    RouterStoreModule.connectRouter(),
    ReactiveFormsModule,
    EffectsModule.run(AuthEffects)
  ],
  providers: [AuthService],
  bootstrap: [AppComponent]
})
export class AppModule {

  constructor(
    apollo: Apollo,
    httpLink: HttpLink
  ) {
    apollo.create({
      link: httpLink.create({
        uri: 'http://localhost:4100/graphql'
      }),
      cache: new InMemoryCache()
    });
  }

}
