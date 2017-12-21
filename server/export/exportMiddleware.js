const path = require('path');
const exportToXlsx = require('./toXlsx');
const exportDetail = require('./exportDetail');

const EXPORTERS = {
  '/export/trips': exportToXlsx,
  '/export/detail': exportDetail,
};

async function exportMiddleware(req, res) {
  if (!req.context || !req.context.user) {
    return res.status(401).end();
  }

  try {
    const exporter = EXPORTERS[req.path];
    if (!exporter) {
      throw new Error('no exporter for ' + req.path);
    }
    const filename = await exporter(req.body);
    res.json(
      'http://' + req.headers.host + '/' + path.relative(__dirname, filename)
    );
  } catch (e) {
    console.error(e);
    return res.status(500).end();
  }
}

module.exports = exportMiddleware;
