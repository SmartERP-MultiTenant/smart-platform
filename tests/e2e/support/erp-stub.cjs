// Hermetic ERP stub for the e2e suite (P4.9).
//
// Serves the ERP M2M/billing surface the kit's team-ERP endpoints consume so
// authenticated extend/cancel flows can be exercised deterministically
// without a real (or dev) ERP instance. Managed by Playwright as a second
// webServer entry — starts before tests, is torn down after the run, in CI
// and locally alike.
//
// Unknown routes answer 404 JSON so tests never depend on stub behavior they
// did not ask for (the app treats a 404 like an unreachable ERP).
'use strict';

const http = require('http');

const HOST = '127.0.0.1';
const PORT = Number(process.env.ERP_STUB_PORT || 4100);

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${HOST}:${PORT}`);
  const method = req.method || 'GET';

  // Health probe for the Playwright webServer entry.
  if (pathname === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // POST /api/platform/billing/subscriptions/by-tenant/:tenantId/(extend|cancel)
  // M2M billing actions used by pages/api/teams/[slug]/erp-extend.ts and
  // erp-cancel.ts.
  const billingAction = pathname.match(
    /^\/api\/platform\/billing\/subscriptions\/by-tenant\/[^/]+\/(extend|cancel)$/
  );
  if (billingAction && method === 'POST') {
    await readBody(req); // consume — handlers send { newEndDate }
    sendJson(res, 200, { data: { ok: true } });
    return;
  }

  sendJson(res, 404, {
    success: false,
    message: `stub:no-route ${method} ${pathname}`,
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[erp-stub] listening on http://${HOST}:${PORT}`);
});
