import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import env from '@/lib/env';

import packageInfo from '../../package.json';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // HEAD is served by the GET path (RFC 9110 §9.3.2): uptime monitors probe with
    // HEAD, and answering them 405 (or worse, the old 503) made a healthy
    // production service read as down. Node drops the response body when the
    // request method is HEAD, so no body special-casing is needed here.
    // Anything else is a client error, not a service failure. P4.33.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).json({
        error: { message: `Method ${req.method} Not Allowed` },
      });
      return;
    }

    // DB check — must not fail the whole health response; we report db.ok instead.
    let db: { ok: boolean; error?: string } = { ok: true };
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      db = { ok: false, error: String(err?.message || err).slice(0, 200) };
    }

    // ERP probe — a genuinely public endpoint, no secrets, hard 3s timeout.
    // NOT `/payments/methods`: that route requires auth (P2.17
    // 86cbcq7g2 — 401 for unauthenticated callers), so probing it made every
    // production health check report `erp.ok:false, error:http-401` even when
    // the ERP was perfectly reachable. The registration catalog is public
    // (200) and still proves the ERP API is up.
    // Health intentionally stays 200 when the ERP is down: this endpoint
    // reports the KIT's health; erp.ok=false is a field for infra to alert on.
    let erp:
      | { ok: boolean; latencyMs?: number; error?: string }
      | Record<string, never> = { ok: false, error: 'unreachable' };
    try {
      const startedAt = Date.now();
      const response = await fetch(
        `${env.erp.apiUrl}/platform/TenantRegistration/catalog/packages`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        }
      );
      const latencyMs = Date.now() - startedAt;
      erp = response.ok
        ? { ok: true, latencyMs }
        : { ok: false, error: `http-${response.status}`, latencyMs };
    } catch (err: any) {
      erp = {
        ok: false,
        error: err?.name === 'TimeoutError' ? 'timeout' : 'unreachable',
      };
    }

    res.status(200).json({
      version: packageInfo.version,
      db,
      erp,
    });
  } catch (err: any) {
    const { statusCode = 503 } = err;
    res.status(statusCode).json({});
  }
}
