import { LeavesAddComponent } from './leaves/leaves-add/leaves-add.component';
import { LeavesListComponent } from './leaves/leaves-list/leaves-list.component';
import { LeavesApprovalComponent } from './leaves/leaves-approval/leaves-approval.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Route } from '@angular/router';
import { LeavesExportComponent } from './leaves/leaves-export/leaves-export.component';
import { SummaryComponent } from './leaves/summary/summary.component';

const routes: Route[] = [
  { path: 'approval', component: LeavesApprovalComponent },
  { path: 'list/add', component: LeavesAddComponent },
  { path: 'list', component: LeavesListComponent },
  { path: 'export', component: LeavesExportComponent },
  { path: 'summary', component: SummaryComponent },
  {
    path: '',
    redirectTo: '/list',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [CommonModule, RouterModule.forRoot(routes)],
  exports: [RouterModule],
  declarations: [],
})
export class AppRoutingModule {}
