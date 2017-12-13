import { UserInfo } from './../state/auth';
import { of } from 'rxjs/observable/of';
import { LeavesService } from './../services/leaves.service';
import { AppState } from './../state/root';
import { Store } from '@ngrx/store';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';
import { mockStoreModule, mockState } from '../mocks/store.mock';

import { NavHeaderComponent } from './nav-header.component';

describe('NavHeaderComponent', () => {
  let component: NavHeaderComponent;
  let fixture: ComponentFixture<NavHeaderComponent>;
  let de: DebugElement;
  let store: Store<AppState>;

  beforeEach(async(() => {
    const mockService = {
      getPendingLeaves: () => of([])
    };
    TestBed.configureTestingModule({
      declarations: [NavHeaderComponent],
      imports: [
        mockStoreModule()
      ],
      providers: [
        { provide: LeavesService, useValue: mockService },
      ]
    })
      .compileComponents();
  }));

  beforeEach(() => {
    store = TestBed.get(Store);
    fixture = TestBed.createComponent(NavHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not show right dropdown if not logged in', () => {
    de = fixture.debugElement.query(By.css('#navbarDropdownMenuLink'));
    expect(de).toBeFalsy();
  });

  it('should show right dropdown if logged in', () => {
    mockState(store, 'auth.userInfo', { username: 'testName' });
    fixture.detectChanges();
    de = fixture.debugElement.query(By.css('#navbarDropdownMenuLink'));
    expect(de).toBeTruthy();
    expect(de.nativeElement.textContent).toContain('testName');
  });

});
