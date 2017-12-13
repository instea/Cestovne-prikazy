import { Pipe, PipeTransform } from '@angular/core';
import { LeaveState } from './../leaves/leave';

@Pipe({name: 'translateLeaveState'})
export class TranslateLeaveStatePipe implements PipeTransform {
  transform(value: number): string {
    return LeaveState[value];
  }
}
