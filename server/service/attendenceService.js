const request = require('superagent');
const moment = require('moment-timezone');
const Holidays = require('date-holidays');
const { LEAVE_STATE_CODES } = require('../../src/data/LeaveState');
const { findUserLeavesForRangeByEmail } = require('../service/leaveService');

const TOGGL_REPORTS_BASE_URL = 'https://api.track.toggl.com/reports/api/v3';
const getUserDataFromSSO = async () => {
  const ssoData = await request.get(process.env.SSO_URI).auth(process.env.SSO_USERNAME, process.env.SSO_PASSWORD);
  return ssoData.body.map(user => {
    const u = {};
    u.name = user.name;
    u.email = user.email;
    user.keys.forEach(kv => u[kv.key] = kv.value);
    return u;
  });
};

const initAttendenceData = (end, ssoUserData) => {
  const attendence = {};

  const userIdToNameMap = {};
  ssoUserData.filter(user => user.togglUserId).forEach(user => {
    const days = [];
    for (let i = 0; i < end.date(); i++) {
      days.push({
        logged_time: 0,
        leave: ''
      });
    }
    attendence[user.togglUserId] = {
      days,
      total: 0,
      contractType: user.contractType
    };
    userIdToNameMap[user.togglUserId] = user.name;
  });

  return { attendence, userIdToNameMap };
};

const leaveTypeMap = {
  'ANNUAL': 'D',
  'SICKNESS': 'PN',
  'DOCTOR': 'L',
  'OTHER': 'I'
};

const holidays = new Holidays('SK');

const isWorkingDay = (date) => {
  const isWeekend = date.isoWeekday() >= 6;
  const isHoliday = holidays.isHoliday(date.toDate());
  return !(isWeekend || isHoliday);
};

const writeLeaveToAttendence = (attendence, month, userId, leave) => {
  const m = moment(leave.startDate);
  while(m.toDate() <= leave.endDate) {
    if (m.month() === month && isWorkingDay(m)) {
      let leaveType = leaveTypeMap[leave.type] || leaveTypeMap['OTHER'];
      if (leave.type === 'ANNUAL') {
        leaveType += leave.isHalfDay ? '4' : '8';
      }
      if (attendence[userId].days[m.date() - 1].leave) {
        attendence[userId].days[m.date() - 1].leave += ', ' + leaveType;
      } else {
        attendence[userId].days[m.date() - 1].leave = leaveType;
      }
    }
    m.add(1, 'day');
  }
};

const writeTogglDataToAttendence = async (attendence, user, startString, endString) => {
  // toogl sends paginated data, every response contains info about items in xNextRowNumber
  // https://engineering.toggl.com/docs/reports/detailed_reports/index.html
  let xNextRowNumber = null;
  let arePagesLeft = true;
  if (user.togglWorkspaceId) {
    while (arePagesLeft) {
      const payload = {
        start_date: `${startString}`,
        end_date: `${endString}`,
        user_ids: [parseInt(user.togglUserId)],
      };

      if (xNextRowNumber) {
        payload.first_row_number = parseInt(xNextRowNumber);
      }

      const response = await request
        .post(
          `${TOGGL_REPORTS_BASE_URL}/workspace/${user.togglWorkspaceId}/search/time_entries`)
        .send(payload)
        .auth(user.togglApiToken, 'api_token')
        .set('Accept', 'application/json');

      response.body.forEach(entry => {
        const timeEntries = entry.time_entries;
        timeEntries.forEach(timeEntry => {
          const durationInHours = timeEntry.seconds / 60 / 60;
          const date = moment(timeEntry.start);
          attendence[entry.user_id].days[date.date() - 1]['logged_time'] += durationInHours;
          attendence[entry.user_id].total += durationInHours;
        });
      });

      xNextRowNumber = response.headers['x-next-row-number'] === xNextRowNumber
        ? null : response.headers['x-next-row-number'];

      arePagesLeft = Boolean(xNextRowNumber);
      await new Promise(r => setTimeout(r, 500));
    }
  }
};
const getAttendenceData = async (year, month) => {
  // server could be run from anywhere
  const timezone = process.env.DEFAULT_TIMEZONE || 'Europe/Bratislava';
  moment.tz.setDefault(timezone);

  // moment.js enumerates months from zero (0 = January, 11 = December)
  const start = moment().year(year).month(month - 1).startOf('month');
  const end = moment().year(year).month(month - 1).endOf('month');

  const startString = start.format('YYYY-MM-DD');
  const endString = end.format('YYYY-MM-DD');

  let ssoUserData;
  try {
    ssoUserData = await getUserDataFromSSO();
  } catch (err) {
    console.log(err);
    return {
      error: 'Cannot get data from SSO, try again later.',
      attendence: {}
    };
  }

  const { attendence, userIdToNameMap } = initAttendenceData(end, ssoUserData);

  for(let user of ssoUserData) {
    if (user.employee !== '1') {
      continue;
    }

    try {
      await writeTogglDataToAttendence(attendence, user, startString, endString);
    } catch (err) {
      console.log(err);
      return {
        error: 'Cannot get data from Toggl, try again later.',
        attendence: {}
      };
    }

    const userLeaves = await findUserLeavesForRangeByEmail(user.email, [start.toDate(), end.toDate()]);
    userLeaves.filter(l => l.state === LEAVE_STATE_CODES.APPROVED).forEach(leave => {
      writeLeaveToAttendence(attendence, month - 1, user.togglUserId, leave);
    });
  };

  for(let userId in attendence) {
    attendence[userIdToNameMap[userId]] = attendence[userId];
    delete attendence[userId];
  }

  return {
    error: undefined,
    attendence: {
      start: startString,
      end: endString,
      attendence
    }
  };
};

module.exports = { getAttendenceData };
