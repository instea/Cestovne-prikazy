import { LeavesListComponent } from './leaves/leaves-list/leaves-list.component';
import { LeavesApprovalComponent } from './leaves/leaves-approval/leaves-approval.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Route } from '@angular/router';
import { AppComponent } from './app.component';

const routes: Route[] = [
  { path: 'approval', component: LeavesApprovalComponent },
  { path: 'list', component: LeavesListComponent },
  {
    path: '',
    redirectTo: '/list',
    pathMatch: 'full'
  },
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forRoot(routes)
  ],
  exports: [RouterModule],
  declarations: []
})
export class AppRoutingModule { }
