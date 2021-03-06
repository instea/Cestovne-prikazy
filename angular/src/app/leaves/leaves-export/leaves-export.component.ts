import {
  getExportProgress,
  getExportedUrl,
  getExportError,
  getUserInfo,
} from './../../state/selectors';
import { AppState } from './../../state/root';
import { UsersService } from './../../services/users.service';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  AbstractControl,
  Validators,
} from '@angular/forms';
import { User } from '../../login-page/user';
import { SelectOption } from '../leaves-add/leaves-add.component';
import { Store } from '@ngrx/store';
import { GenerateExport } from '../../state/leaves';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/withLatestFrom';

@Component({
  selector: 'app-leaves-export',
  templateUrl: './leaves-export.component.html',
  styleUrls: ['./leaves-export.component.scss'],
})
export class LeavesExportComponent implements OnInit {
  users: SelectOption[];
  exportGroup: FormGroup;
  inProgress$: Observable<boolean>;
  url$: Observable<string>;
  error$: Observable<string>;

  constructor(
    fb: FormBuilder,
    usersService: UsersService,
    private store: Store<AppState>
  ) {
    this.exportGroup = fb.group({
      userId: [undefined, Validators.required],
      month: [new Date()],
    });
    usersService
      .getUsers()
      .withLatestFrom(getUserInfo(store))
      .subscribe(([users, userInfo]) => {
        this.users = toOptions(users);
        const user: User = users.find(_user => _user.email === userInfo.email);
        if (user) {
          this.exportGroup.patchValue({
            userId: user.id,
          });
        }
      });
  }

  get month(): AbstractControl {
    return this.exportGroup.get('month');
  }

  onSubmit() {
    const { value } = this.exportGroup;
    console.log('on submit', value);
    const { month } = value;
    // reset to the beginning of the month
    month.setDate(1);
    const payload = {
      userId: value.userId,
      month,
    };
    this.store.dispatch(new GenerateExport(payload));
  }

  ngOnInit() {
    this.inProgress$ = getExportProgress(this.store);
    this.url$ = getExportedUrl(this.store);
    this.error$ = getExportError(this.store);
  }

  download(url: string, event?: MouseEvent) {
    if (event) {
      event.preventDefault();
    }
    window.location.assign(url);
  }
}

function toOptions(users: User[]): SelectOption[] {
  return users.map(user => ({ value: user.id, label: user.getFullName() }));
}
