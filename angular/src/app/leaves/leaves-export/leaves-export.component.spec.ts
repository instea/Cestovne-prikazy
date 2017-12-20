import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LeavesExportComponent } from './leaves-export.component';

describe('LeavesExportComponent', () => {
  let component: LeavesExportComponent;
  let fixture: ComponentFixture<LeavesExportComponent>;

  beforeEach(
    async(() => {
      TestBed.configureTestingModule({
        declarations: [LeavesExportComponent],
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
