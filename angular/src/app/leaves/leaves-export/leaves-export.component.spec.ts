import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CalendarModule } from 'primeng/primeng';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs/observable/of';

import { LeavesExportComponent } from './leaves-export.component';
import { UsersService } from './../../services/users.service';
import { mockStoreModule } from '../../mocks/store.mock';

describe('LeavesExportComponent', () => {
  let component: LeavesExportComponent;
  let fixture: ComponentFixture<LeavesExportComponent>;

  beforeEach(
    async(() => {
      const mockService = {
        getUsers: () => of([]),
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
        providers: [{ provide: UsersService, useValue: mockService }],
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
