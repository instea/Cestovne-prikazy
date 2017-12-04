import { Store } from '@ngrx/store';
import { isLoggedIn } from './state/selectors';
import { AppState } from './state/root';
import { Component } from '@angular/core';
import { Observable } from 'rxjs/Observable';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Annual / Sick Leaves Management';
  loggedIn: Observable<boolean>;

  constructor(store: Store<AppState>) {
    this.loggedIn = isLoggedIn(store);
  }
}
