import { Component, OnInit } from '@angular/core';
import { Apollo } from 'apollo-angular';
import gql from 'graphql-tag';
import { Observable } from 'rxjs/Observable';

import 'rxjs/add/operator/map';

const LeavesQuery = gql`
query LeavesQuery {
  getLeaves {
    id
  }
}
`;

@Component({
  selector: 'app-leaves-list',
  templateUrl: './leaves-list.component.html',
  styleUrls: ['./leaves-list.component.scss']
})
export class LeavesListComponent implements OnInit {
  leaves: Observable<any>;

  constructor(private apollo: Apollo) { }

  ngOnInit() {
    this.leaves = this.apollo.watchQuery<any>({ query: LeavesQuery }).valueChanges.map(({ data }) => data.getLeaves);
  }

}
