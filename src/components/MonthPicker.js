import React, {Component} from 'react';
import MonthPickerLib from 'react-month-picker';
import 'react-month-picker/css/month-picker.css';
import {FormControl} from 'react-bootstrap';
import moment from 'moment';

const months = [];
for (let i = 0; i < 12; i++) {
  months.push(moment().month(i).format("MMM"));
}

const toDateObj = (value) => {
  const m = moment(value || '', 'YYYY-MM');
  return {
    year: m.year(),
    month: m.month() + 1
  };
};

const toReadable = (value) => moment(value, 'YYYY-MM').format("MMM YYYY");

const fromYearAndMonth = (y, m) => moment().year(y).month(m - 1).format('YYYY-MM');

class MonthPicker extends Component {

  render() {

    const {onChange, onBlur, value, ...rest} = this.props;

    return (
      <MonthPickerLib ref={m => this.instance = m} lang={months} value={toDateObj(value)} {...rest}
        onChange={(y, m) => onChange(fromYearAndMonth(y, m))} onDismiss={val => onChange(fromYearAndMonth(val.year, val.month))}>

        <FormControl type="text" value={toReadable(value)}
          onClick={() => this.instance && this.instance.show()}
          onChange={() => {}} />
      </MonthPickerLib>
    );

  }

}

export default MonthPicker;
