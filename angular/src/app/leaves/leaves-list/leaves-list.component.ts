import { LeavesService } from './../../services/leaves.service';
import { Leave } from './../leave';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs/Observable';


@Component({
  selector: 'app-leaves-list',
  templateUrl: './leaves-list.component.html',
  styleUrls: ['./leaves-list.component.scss']
})
export class LeavesListComponent implements OnInit {
  leaves: Observable<Leave[]>;

  constructor(private leaveService: LeavesService) { }

  ngOnInit() {
    this.leaves = this.leaveService.getLeaves();
  }

}


