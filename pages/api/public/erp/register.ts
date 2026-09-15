import { NextApiRequest, NextApiResponse } from 'next';

import { erp } from '@/lib/erp';
import { respondErpError } from '@/lib/payments/publicErpError';
import { clientKey, limiters } from '@/lib/rateLimit';
import { validateRecaptcha } from '@/lib/recaptcha';
import { erpRegistrationSchema } from '@/lib/zod/erp';

/**
 * The ERP's registration-rejection vocabulary, mapped to stable codes (PG-52).
 *
 * The ERP reports a rejected registration on a **200** with `success: false`
 * plus a human sentence, so `erpFetch` never throws and the catch block never
 * sees it — it has to be normalised here, by value.
 *
 * Before this map, that sentence was forwarded to the browser verbatim
 * (`result.message || 'Registration failed'`). Two problems: it is upstream
 * prose in a UI whose default locale is Arabic, and the funnel client
 * (`components/erp/RegisterFunnel.tsx:48-58`) had to recognise the sentences
 * itself, ending in a `return raw` fallback that rendered whatever arrived.
 *
 * The codes below are the SAME ones that client-side matcher already resolved
 * those sentences to, and they are emitted in the form the client renders
 * directly: its first rule is `raw.startsWith('erp-error-') -> t(raw)`. So the
 * customer sees exactly the same localized copy as before, with no client
 * change and no sentence ever leaving this process.
 *
 * Deliberately a closed, allow-listed set — the registration-domain counterpart
 * of `paymentErrorCodeFromUpstream` (`lib/payments/errorCopy.ts`), and for the
 * same reason: every unknown sentence collapses to one generic code rather than
 * passing upstream text through. Sentences are matched exactly, never by
 * substring, so no upstream payload can steer the mapping.
 */
const REGISTRATION_ERROR_CODES: Record<string, string> = {
  'Subdomain already taken.': 'erp-error-subdomain-taken',
  'Admin email or username is already in use.': 'erp-error-admin-exists',
  'Invalid package.': 'erp-error-invalid-package',
  'You must select a package or custom modules.':
    'erp-error-must-select-package',
  'Tenant.Owner role is not configured.': 'erp-error-role-unconfigured',
};

const registrationErrorCode = (message: unknown): string =>
  (typeof message === 'string' && REGISTRATION_ERROR_CODES[message]) ||
  'erp-error-unexpected';

/**
 * The code for a body that fails `erpRegistrationSchema`.
 *
 * A code, never zod's prose. `error.message` is rendered to the customer by
 * `RegisterFunnel.getErpErrorMessage`, which maps anything carrying the
 * `erp-error-` prefix through `t()` — so this resolves to localized copy in both
 * locales. Returning `parsed.error.errors[0].message` instead would print an
 * English sentence such as "String must contain at least 2 character(s)" inside
 * the Arabic-first funnel, which is the same defect class PG-52 removed from the
 * payment routes.
 *
 * The zod detail is still returned in `issues` for diagnostics. It is
 * deliberately not rendered: it repeats the prose, and it describes the schema
 * rather than the customer's mistake.
 *
 * `check-locale.js` resolves keys by scanning for translation call sites, which
 * a server-issued code never appears at — so this key is registered in that
 * script's `exceptionList`, the same mechanism `erp-error-invalid-captcha` uses.
 */
const INVALID_REGISTRATION_REQUEST = 'erp-error-invalid-request';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'POST':
        await handlePOST(req, res);
        break;
      default:
        res.setHeader('Allow', 'POST');
        res.status(405).json({
          error: { message: `Method ${req.method} Not Allowed` },
        });
    }
  } catch (error: unknown) {
    // PG-52: never echo `error.message` — see publicErpError.ts. This catch is
    // what carries `validateRecaptcha`'s `ApiError(400, 'erp-error-invalid-captcha')`:
    // the responder preserves an already-coded 4xx, so a captcha failure still
    // reaches the form as a distinguishable code rather than a generic 502.
    respondErpError(res, error);
  }
}

const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  // Rate limit first: cheapest guard, before schema parsing and the
  // external reCAPTCHA verification round-trip (abuse protection).
  if (!limiters.register.allow(clientKey(req))) {
    res.status(429).json({ error: { message: 'too-many-requests' } });
    return;
  }

  const parsed = erpRegistrationSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: { message: INVALID_REGISTRATION_REQUEST },
      issues: parsed.error.flatten(),
    });
    return;
  }

  await validateRecaptcha(parsed.data.recaptchaToken);

  const { recaptchaToken: _recaptchaToken, ...registrationData } = parsed.data;
  void _recaptchaToken;
  const result = await erp.registerTenant(registrationData);

  if (!result.success) {
    // PG-52: the ERP's own sentence never leaves this process — it is mapped to
    // the stable code the client already knows how to render.
    res.status(400).json({
      error: {
        message: registrationErrorCode(result.message),
      },
    });
    return;
  }

  res.json({ data: result });
};
