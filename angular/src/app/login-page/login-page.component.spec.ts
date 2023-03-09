import { ReactiveFormsModule } from '@angular/forms';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { mockStoreModule } from '../mocks/store.mock';
import { AuthServiceMock } from '../mocks/google.auth.mock';
import { LoginPageComponent } from './login-page.component';

describe('LoginPageComponent', () => {
  let component: LoginPageComponent;
  let fixture: ComponentFixture<LoginPageComponent>;

  beforeEach(
    async(() => {
      window['google'] = {
        accounts: {
          id: {
            initialize: idConfiguration => {},
            renderButton: (parent, options, clickHandler) => {},
          },
        },
      };

      TestBed.configureTestingModule({
        declarations: [LoginPageComponent],
        imports: [ReactiveFormsModule, mockStoreModule()],
        providers: [{ provide: window, useClass: AuthServiceMock }],
      }).compileComponents();
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
