import { NextApiRequest, NextApiResponse } from 'next';

import { prisma } from '@/lib/prisma';
import env from '@/lib/env';
import { erp, ErpApiError, ErpLoginResult } from '@/lib/erp';
import { throwIfNoTeamAccess } from 'models/team';
import { erpConnectSchema } from '@/lib/zod/erp';
import { encryptErpToken, decryptErpToken } from '@/lib/crypto/erpToken';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET':
        await handleGET(req, res);
        break;
      case 'POST':
        await handlePOST(req, res);
        break;
      default:
        res.setHeader('Allow', 'GET, POST');
        res.status(405).json({
          error: { message: `Method ${req.method} Not Allowed` },
        });
    }
  } catch (error: any) {
    const message = error.message || 'Something went wrong';
    const status = error.status || 500;

    res.status(status).json({ error: { message } });
  }
}

/** Object fields read off an ERP module entry, in precedence order. */
const MODULE_NAME_FIELDS = ['name', 'code', 'displayName', 'title'] as const;

/**
 * Entries longer than this are dropped instead of rendered as an unbounded
 * badge (a malformed ERP row must not be able to stretch the module list).
 */
const MAX_MODULE_NAME_LENGTH = 64;

/**
 * Normalizes the ERP `GET /platform/TenantStatus/modules` payload into a plain
 * `string[]` before it is handed to the browser (P3.1).
 *
 * The ERP boundary is deliberately untyped — `lib/erp.ts` declares this call as
 * `erpFetch<unknown>` — and no contract test pins the payload, so the *route*,
 * not the React component, is where the shape gets narrowed. Previously the
 * page pulled `(modules as any)?.modules` inline and rendered whatever came
 * back; now malformed input is normalized away at the trust boundary.
 *
 * Accepted payload shapes (both observed in this repo):
 *   - a bare array of entries;
 *   - an object wrapping that array as `modules` (the shape asserted by
 *     `__tests__/lib/erp.spec.ts`).
 *
 * Entry handling:
 *   - a string is used as-is (trimmed);
 *   - an object is read through `name -> code -> displayName -> title`. `name`
 *     and `code` are the fields `ErpSystemModule` / `ErpPackageSummaryModule`
 *     document in `lib/erp.ts`; `displayName` and `title` are carried over from
 *     the previous inline client-side tolerance and are not yet part of any
 *     published contract.
 *   - anything else is dropped.
 *
 * Empty and over-long names are dropped, and duplicates collapse
 * case-insensitively while keeping the first-seen casing. Anything unrecognized
 * (a string, `null`, `{}`, a number) normalizes to `[]`, which the page renders
 * as its existing "no active modules" empty state — never as raw ERP data.
 */
export const normalizeTenantModules = (payload: unknown): string[] => {
  const entries = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' &&
        payload !== null &&
        Array.isArray((payload as { modules?: unknown }).modules)
      ? ((payload as { modules: unknown[] }).modules as unknown[])
      : [];

  const seen = new Set<string>();
  const modules: string[] = [];

  for (const entry of entries) {
    let name = '';

    if (typeof entry === 'string') {
      name = entry;
    } else if (typeof entry === 'object' && entry !== null) {
      const record = entry as Record<string, unknown>;
      for (const field of MODULE_NAME_FIELDS) {
        const value = record[field];
        if (typeof value === 'string' && value.trim()) {
          name = value;
          break;
        }
      }
    }

    const normalized = name.trim();

    if (!normalized || normalized.length > MAX_MODULE_NAME_LENGTH) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    modules.push(normalized);
  }

  return modules;
};

// Get the linked ERP subscription status + enabled modules
const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  const teamMember = await throwIfNoTeamAccess(req, res);
  const team = teamMember.team;

  if (!team.erpAccessToken) {
    res.json({ data: { linked: false } });
    return;
  }

  try {
    const rawToken = decryptErpToken(team.erpAccessToken);
    const [subscription, modules] = await Promise.all([
      erp.getTenantSubscription(rawToken),
      erp.getTenantModules(rawToken),
    ]);

    res.json({
      data: {
        linked: true,
        tenantId: team.erpTenantId,
        subdomain: team.erpSubdomain,
        subscription,
        // Normalized to `string[]` at the boundary so the browser never
        // receives the raw (untyped) ERP payload.
        modules: normalizeTenantModules(modules),
      },
    });
  } catch {
    res.json({
      data: {
        linked: true,
        error: 'erp-unreachable',
        subdomain: team.erpSubdomain,
      },
    });
  }
};

// Link the kit team to an ERP tenant via tenant admin credentials
const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  const teamMember = await throwIfNoTeamAccess(req, res);
  const team = teamMember.team;

  const parsed = erpConnectSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message || 'invalid-input',
      },
    });
    return;
  }

  const { subdomain, adminUserName, adminPassword } = parsed.data;

  let result: ErpLoginResult;

  try {
    result = await erp.login(adminUserName, adminPassword);
  } catch (error: any) {
    if (
      error instanceof ErpApiError &&
      (error.status === 401 || error.status === 404)
    ) {
      res.status(401).json({ error: { message: 'invalid-credentials' } });
      return;
    }

    throw error;
  }

  if (result.authToken) {
    await prisma.team.update({
      where: { id: team.id },
      data: {
        erpTenantId: result.tenantId ? String(result.tenantId) : null,
        erpSubdomain: subdomain,
        erpApiUrl: env.erp.apiUrl,
        erpAccessToken: encryptErpToken(result.authToken),
        erpLinkedAt: new Date(),
      },
    });

    res.json({ data: { linked: true, tenantId: result.tenantId } });
    return;
  }

  if (result.userId) {
    res.status(400).json({ error: { message: 'otp-required' } });
    return;
  }

  res.status(401).json({ error: { message: 'invalid-credentials' } });
};
