import { NextApiRequest, NextApiResponse } from 'next';

import { prisma } from '@/lib/prisma';
import env from '@/lib/env';
import { erp, ErpApiError, ErpLoginResult } from '@/lib/erp';
import { type ErpModuleEntry } from '@/lib/erpModuleLabel';
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

/**
 * Entry fields read as the human label, in precedence order. `code` is read
 * separately: it is the field the page localizer keys its translations on, not a
 * display label in its own right.
 */
const MODULE_LABEL_FIELDS = ['name', 'displayName', 'title'] as const;

/** A string entry field, trimmed; the empty string when it is absent or not a string. */
const readEntryField = (
  record: Record<string, unknown>,
  field: string
): string => {
  const value = record[field];

  return typeof value === 'string' ? value.trim() : '';
};

/**
 * The width cap. It is enforced per *field*, not per entry: no string longer
 * than this crosses to the browser. A malformed ERP row must not be able to
 * stretch the module list, and because the page renders `name` whenever the
 * code has no branch, the cap has to bound both fields rather than only the one
 * the entry happened to be selected on.
 */
const MAX_MODULE_NAME_LENGTH = 64;

/** Whether a field may cross the boundary. */
const isWithinWidth = (value: string) => value.length <= MAX_MODULE_NAME_LENGTH;

/**
 * Object fields that may carry the module array, in precedence order.
 *
 * `enabledModules` is the field the live ERP sends; `modules` is the older
 * wrapper kept for compatibility. Precedence is positional, so when an object
 * carries both, `enabledModules` wins.
 */
const MODULE_ARRAY_FIELDS = ['enabledModules', 'modules'] as const;

/** First array found under `MODULE_ARRAY_FIELDS`, or `[]` when none is. */
const readModuleArray = (payload: Record<string, unknown>): unknown[] => {
  for (const field of MODULE_ARRAY_FIELDS) {
    const value = payload[field];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
};

/**
 * Normalizes the ERP `GET /platform/TenantStatus/modules` payload into
 * `{ code, name }` entries before it is handed to the browser (P3.1). Those are
 * exactly the two fields the page needs, each capped at
 * `MAX_MODULE_NAME_LENGTH`, so the raw ERP object — its `id`, and any field the
 * DTO gains later — never reaches the browser.
 *
 * The ERP boundary is deliberately untyped — `lib/erp.ts` declares this call as
 * `erpFetch<unknown>` — and no contract test pins the payload, so the *route*,
 * not the React component, is where the shape gets narrowed. Previously the
 * page pulled `(modules as any)?.modules` inline and rendered whatever came
 * back; now malformed input is normalized away at the trust boundary.
 *
 * Accepted payload shapes, in precedence order:
 *   - an object wrapping the array as `enabledModules` — the field the live ERP
 *     sends. `TenantEnabledModulesResponseDto` is serialized camelCase
 *     (`{ subscriptionId, packageId, packageName, status, enabledModules,
 *     enabledModuleCodes }`), and `lib/erp.ts:153` already declares this exact
 *     entry shape for the change-plan response.
 *   - an object wrapping that array as `modules` — the older wrapper, still the
 *     response mocked by `__tests__/lib/erp.spec.ts`.
 *   - a bare array of entries.
 *
 * `enabledModuleCodes` is deliberately NOT read: it mirrors the codes that the
 * entries of `enabledModules` already carry, so it is a sibling field rather
 * than a fallback. Reading it would also bypass the per-entry precedence below,
 * and would substitute codes whenever the canonical array is legitimately
 * empty. Do not add it to `MODULE_ARRAY_FIELDS`.
 *
 * Entry handling:
 *   - a bare string entry is carried as the `code`, which is how the page has
 *     always treated it: it is the localizer's input, and an unrecognised value
 *     still renders as itself.
 *   - an object entry reads `code` verbatim and the human label through
 *     `name -> displayName -> title`. `name` is the field `ErpSystemModule` /
 *     `ErpPackageSummaryModule` document in `lib/erp.ts`; `displayName` and
 *     `title` are carried over from the previous inline client-side tolerance
 *     and are not part of any published contract.
 *   - `code` decides the primary label (`code || name`), which is what the
 *     dedupe below applies to, and `code` deliberately leads `name`: the
 *     ERP's `PlatformSeeder` seeds `SystemModule.Code` with the Latin token and
 *     `SystemModule.Name` with an Arabic label, and `getLocalizedModuleName` in
 *     `pages/teams/[slug]/erp.tsx` keys its translations on the *code*
 *     (`erp-module-pos` and friends). Carrying `name` alongside it is what lets
 *     the page fall back to the ERP's own Arabic label when a code has no
 *     branch — without it, a module the platform has never translated would
 *     render a bare Latin token in the Arabic UI.
 *   - anything else is dropped.
 *
 * Width is enforced per field, and it is the one guarantee this boundary makes
 * about size: every forwarded field is at most `MAX_MODULE_NAME_LENGTH`
 * characters. An over-long field is blanked rather than made fatal, so an
 * over-long `code` does not take a renderable entry down with it — the entry
 * survives on its `name`, which is what the pre-change route rendered — and an
 * over-long `name` cannot ride along behind a short `code`, which is the field
 * the page falls back to whenever the code has no branch. An entry is dropped
 * only when both fields are unusable.
 *
 * Duplicates collapse case-insensitively on the surviving primary label,
 * keeping the first-seen casing. Anything unrecognized (a string, `null`, `{}`,
 * a number) normalizes to `[]`, which the page renders as its existing "no
 * active modules" empty state — never as raw ERP data.
 */
export const normalizeTenantModules = (payload: unknown): ErpModuleEntry[] => {
  const entries = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null
      ? readModuleArray(payload as Record<string, unknown>)
      : [];

  const seen = new Set<string>();
  const modules: ErpModuleEntry[] = [];

  for (const entry of entries) {
    let code = '';
    let name = '';

    if (typeof entry === 'string') {
      code = entry.trim();
    } else if (typeof entry === 'object' && entry !== null) {
      const record = entry as Record<string, unknown>;

      code = readEntryField(record, 'code');

      for (const field of MODULE_LABEL_FIELDS) {
        const value = readEntryField(record, field);

        // A field wider than the cap is not a usable label. Skipping it here —
        // rather than selecting it and blanking the entry afterwards — lets the
        // chain still reach a narrower field, so an over-long `name` cannot cost
        // the entry the `displayName` that would otherwise have rendered.
        if (value && isWithinWidth(value)) {
          name = value;
          break;
        }
      }
    }

    // The width guard, and the only place a field is dropped for size. Blanking
    // the field rather than the entry keeps both directions honest: the cap
    // bounds what crosses to the browser, and a renderable module is not lost
    // because a sibling field was malformed. `name` is already within the cap —
    // the chain above refuses over-long candidates — so `code` is the only field
    // that can still need blanking, and a bare-string entry is exactly that
    // case.
    if (!isWithinWidth(code)) {
      code = '';
    }

    // The primary label decides survival and the dedupe. It is the code whenever
    // the entry carries a usable one, which is the precedence the page resolves
    // labels with.
    const label = code || name;

    if (!label) {
      continue;
    }

    const dedupeKey = label.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    modules.push({ code, name });
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
        // Normalized to `{ code, name }` entries at the boundary so the browser
        // never receives the raw (untyped) ERP payload.
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
