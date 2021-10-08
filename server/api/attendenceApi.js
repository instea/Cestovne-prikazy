const auth = require('basic-auth');
const { getAttendenceData } = require('../service/attendenceService');

const httpBasicAuthentication = async (req, res, next) => {
  const setUnauthorized = () => res.status(401).end();
  const credentials = auth(req);
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

const getAttendence = async (req, res) => {
  const requestedMonth = req.params.month;
  const requestedYear = req.params.year;
  if(isNaN(requestedMonth)) {
    return res.status(400).json({
      message: 'Month is not a number.'
    });
  }

  if(isNaN(requestedYear)) {
    return res.status(400).json({
      message: 'Year is not a number.'
    });
  }

  const { error, attendence} = await getAttendenceData(requestedYear, requestedMonth);

  if (error) {
    return res.status(500).json({
      message: error
    });
  }
  res.status(200).json(attendence);

};

module.exports = {setupAttendenceApi};