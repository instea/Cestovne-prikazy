import { getExportProgress, getExportedUrl } from './../../state/selectors';
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

  constructor(
    fb: FormBuilder,
    usersService: UsersService,
    private store: Store<AppState>
  ) {
    this.exportGroup = fb.group({
      userId: [undefined, Validators.required],
      month: [new Date()],
    });
    usersService.getUsers().subscribe(users => (this.users = toOptions(users)));
  }

  get month(): AbstractControl {
    return this.exportGroup.get('month');
  }

  onSubmit() {
    const { value } = this.exportGroup;
    console.log('on submit', value);
    const { month } = value;
    // reset to the begin of month
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
  }

  download(url: string) {
    window.location.assign(url);
  }
}

function toOptions(users: User[]): SelectOption[] {
  return users.map(user => ({ value: user.id, label: user.getFullName() }));
}
