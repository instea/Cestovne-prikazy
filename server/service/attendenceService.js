const request = require('superagent');
const moment = require('moment');
const { LEAVE_STATE_CODES } = require('../../src/data/LeaveState');
const { findUserLeavesForRangeByEmail } = require('../service/leaveService');
const TOGGL_REPORTS_DETAILS_URL = 'https://toggl.com/reports/api/v2/details';

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

const writeLeaveToAttendence = (attendence, month, userId, leave) => {
  const m = moment(leave.startDate);
  while(m.toDate() < leave.endDate) {
    if (m.month() === month) {
      const leaveType = leaveTypeMap[leave.type] || leaveTypeMap['OTHER'];
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
  // toogl sends paginated data, every response contains info about items per_page and total_count
  let page = 1;
  let arePagesLeft = true;
  while (arePagesLeft) {
    const response = await request.get(`${TOGGL_REPORTS_DETAILS_URL}?workspace_id=${user.togglWorkspaceId}&since=${startString}&until=${endString}&user_agent=api_test&user_ids=${user.togglUserId}&page=${page}`)
      .auth(user.togglApiToken, 'api_token');

    response.body.data.forEach(entry => {
      const dur = entry.dur / 1000 / 60 / 60;
      const date = moment(entry.start);
      attendence[entry.uid].days[date.date() - 1]['logged_time'] = attendence[entry.uid].days[date.date() - 1]['logged_time'] + dur;
      attendence[entry.uid].total = attendence[entry.uid].total + dur;
    });
    arePagesLeft = (page * response.body.per_page) < response.body.total_count;
    page++;
  }
};

const getAttendenceData = async (year, month) => {
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