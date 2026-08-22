import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import env from '@/lib/env';

import packageInfo from '../../package.json';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      throw new Error('Method not allowed');
    }

    // DB check — must not fail the whole health response; we report db.ok instead.
    let db: { ok: boolean; error?: string } = { ok: true };
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      db = { ok: false, error: String(err?.message || err).slice(0, 200) };
    }

    // ERP probe — public endpoint, no secrets, hard 3s timeout.
    // Health intentionally stays 200 when the ERP is down: this endpoint
    // reports the KIT's health; erp.ok=false is a field for infra to alert on.
    let erp:
      | { ok: boolean; latencyMs?: number; error?: string }
      | Record<string, never> = { ok: false, error: 'unreachable' };
    try {
      const startedAt = Date.now();
      const response = await fetch(`${env.erp.apiUrl}/payments/methods`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      const latencyMs = Date.now() - startedAt;
      erp = response.ok
        ? { ok: true, latencyMs }
        : { ok: false, error: `http-${response.status}`, latencyMs };
    } catch (err: any) {
      erp = { ok: false, error: err?.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
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
