import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { AppState } from '../state/root';
import { LoginAttemptAction } from '../state/auth';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit {

  loginInfo: FormGroup;

  constructor(fb: FormBuilder, private store: Store<AppState>) {
    this.loginInfo = fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
    });
  }

  ngOnInit() {
  }

  onSubmit() {
    this.store.dispatch(new LoginAttemptAction(this.loginInfo.value));
  }

}
