import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CalendarModule } from 'primeng/primeng';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs/observable/of';

import { LeavesExportComponent } from './leaves-export.component';
import { UsersService } from './../../services/users.service';
import { mockStoreModule } from '../../mocks/store.mock';
import { AuthService } from '../../auth.service';

describe('LeavesExportComponent', () => {
  let component: LeavesExportComponent;
  let fixture: ComponentFixture<LeavesExportComponent>;

  beforeEach(
    async(() => {
      const uMockService = {
        getUsers: () => of([]),
      };
      const aMockService = {
        getUserInfo: () => of({}),
      };
      TestBed.configureTestingModule({
        imports: [
          ReactiveFormsModule,
          CalendarModule,
          BrowserAnimationsModule,
          mockStoreModule(),
        ],
        schemas: [NO_ERRORS_SCHEMA],
        declarations: [LeavesExportComponent],
        providers: [
          { provide: UsersService, useValue: uMockService },
          { provide: AuthService, useValue: aMockService },
        ],
      }).compileComponents();
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(LeavesExportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
