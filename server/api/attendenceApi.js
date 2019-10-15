const request = require('superagent');
const moment = require('moment');
const { LEAVE_STATE_CODES } = require('../../src/data/LeaveState');
const { findUserLeavesForRangeByEmail } = require('../service/leaveService');
var auth = require('basic-auth');
const TOGGL_REPORTS_DETAILS_URL = 'https://toggl.com/reports/api/v2/details';

const httpBasicAuthentication = async (req, res, next) => {
  const setUnauthorized = () => res.status(401).end();
  var credentials = auth(req);
  if (credentials) {
    const isAuthSet = process.env.M2M_USERNAME && process.env.M2M_PASSWORD;
    const isUsernameRight = credentials.name === process.env.M2M_USERNAME;
    const isPasswordRight = credentials.pass === process.env.M2M_PASSWORD;
    if (isAuthSet && isUsernameRight && isPasswordRight) {
      next();
    } else {
      setUnauthorized();
    }
  } else {
    setUnauthorized();
  }
};

const setupAttendenceApi = app => {
  app.use('/api/*', httpBasicAuthentication);
  app.get('/api/attendence/:year/:month', getAttendence);
};

const getUserDataFromSSO = async () => {
  try {
    const ssoData = await request.get(process.env.SSO_URI).auth(process.env.SSO_USERNAME, process.env.SSO_PASSWORD);
    return ssoData.body.map(user => {
      const u = {};
      u.name = user.name;
      u.email = user.email;
      user.keys.forEach(kv => u[kv.key] = kv.value);
      return u;
    });
  } catch (err) {
    console.log(err);
    return [];
  }
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

const getAttendence = async (req, res) => {
  const requestedMonth = req.params.month;
  const requestedYear = req.params.year;
  if(isNaN(requestedMonth)) {
    res.status(400).json({
      message: 'Month is not a number.'
    });
  }

  if(isNaN(requestedYear)) {
    res.status(400).json({
      message: 'Year is not a number.'
    });
  }
  
  // moment.js enumerates months from zero (0 = January, 11 = December)
  const start = moment().year(requestedYear).month(requestedMonth - 1).startOf('month');
  const end = moment().year(requestedYear).month(requestedMonth - 1).endOf('month');

  const startString = start.format('YYYY-MM-DD');
  const endString = end.format('YYYY-MM-DD');

  const ssoUserData = await getUserDataFromSSO();
  const { attendence, userIdToNameMap } = initAttendenceData(end, ssoUserData);
  
  for(let user of ssoUserData) {
    if (user.employee !== '1') {
      console.log(`skip ${user.email}`);
      continue;
    }
    console.log(`attendence for employee: ${user.email}`);
    // toogl sends paginated data, every response contains info about items per_page and total_count
    let page = 1;
    let arePagesLeft = true;
    try {
      while (arePagesLeft) {
        const response = await request.get(`${TOGGL_REPORTS_DETAILS_URL}?workspace_id=${user.togglWorkspaceId}&since=${startString}&until=${endString}&user_agent=api_test&user_ids=${user.togglUserId}&page=${page}`)
          .auth(user.togglApiToken, 'api_token');

        response.body.data.forEach(entry => {
          const dur = entry.dur / 1000 / 60 / 60;
          const date = moment(entry.start);
          attendence[entry.uid].days[date.date() - 1]['logged_time'] = attendence[entry.uid].days[date.date() - 1]['logged_time'] + dur;
          attendence[entry.uid].total = attendence[entry.uid].total + dur;
        });
        console.log(`  page ${page}`);
        arePagesLeft = (page * response.body.per_page) < response.body.total_count;
        page++;
      }
    } catch (err) {
      console.log(err);
      res.status(500).json({
        message: 'Error during loading toggl data.'
      });
    }

    const userLeaves = await findUserLeavesForRangeByEmail(user.email, [start.toDate(), end.toDate()]);
    userLeaves.filter(l => l.state === LEAVE_STATE_CODES.APPROVED).forEach(leave => {
      writeLeaveToAttendence(attendence, requestedMonth - 1, user.togglUserId, leave);
    });
  };

  for(let userId in attendence) {
    attendence[userIdToNameMap[userId]] = attendence[userId];
    delete attendence[userId];
  }

  res.json({
    start: startString,
    end: endString,
    attendence
  });
};

module.exports = {setupAttendenceApi};