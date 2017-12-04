import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LeavesApprovalComponent } from './leaves-approval.component';

describe('LeavesApprovalComponent', () => {
  let component: LeavesApprovalComponent;
  let fixture: ComponentFixture<LeavesApprovalComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ LeavesApprovalComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LeavesApprovalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
