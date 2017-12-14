import { Pipe, PipeTransform } from '@angular/core';
import { LeaveType } from './../leaves/leave';

@Pipe({name: 'translateLeaveType'})
export class TranslateLeaveTypePipe implements PipeTransform {
  transform(value: number): string {
    return LeaveType[value];
  }
}
