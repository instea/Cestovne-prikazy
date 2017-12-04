import { Leave, fromGraphQl } from './../leave';
import { Component, OnInit } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { Observable } from 'rxjs/Observable';

import 'rxjs/add/operator/map';

const LeavesQuery = gql`
query LeavesQuery {
  getLeaves {
    id
    startDate
    endDate
  }
}
`;

@Component({
  selector: 'app-leaves-list',
  templateUrl: './leaves-list.component.html',
  styleUrls: ['./leaves-list.component.scss']
})
export class LeavesListComponent implements OnInit {
  leaves: Observable<Leave[]>;

  constructor(private apollo: Apollo) { }

  ngOnInit() {
    this.leaves = this.apollo.watchQuery<any>({ query: LeavesQuery }).valueChanges.map(({ data }) => toLeaves(data.getLeaves));
  }

}

function toLeaves(items: any[]): Leave[] {
  const models = items.map(fromGraphQl);
  return models;
}
