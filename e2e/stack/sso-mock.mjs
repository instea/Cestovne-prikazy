// TST-03 E2E stack: minimal SSO directory mock (ATT-02 contract). Every GET
// returns the TST-04 contract fixture `sso.basic.json`, so the NFR-08
// anonymize check sees a fixed set of employees: the E2E suite anonymizes
// random addresses (absent → allowed) and `jana.nova@instea.co` (listed →
// 409 SSO_EMPLOYEE_ACTIVE). Credentials are not checked.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const body = readFileSync(
  process.env.SSO_FIXTURE ?? '/fixtures/sso.basic.json',
);
const port = Number(process.env.PORT ?? 4010);

createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
}).listen(port, () => {
  process.stdout.write(`SSO mock listening on ${port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => process.exit(0));
}
