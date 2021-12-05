const { getUserByEmail } = require('../service/userService');

const checkMongo = async () => {
  await getUserByEmail('dummy@just-to-test.com');
};

const checks = [checkMongo];

const healthCheck = async (req, res) => {
  let ok = true;
  const response = {};
  const performCheck = async (fn) => {
    try {
      await fn();
      response[fn.name] = 'ok';
    } catch (err) {
      response[fn.name] = `${err}`;
      ok = false;
    }
  };
  await Promise.all(checks.map((fn) => performCheck(fn)));
  return res.status(ok ? 200 : 500).json(response);
};

const setupHealthCheck = (app) => {
  app.use('/health-check', healthCheck);
};

module.exports = { setupHealthCheck };
