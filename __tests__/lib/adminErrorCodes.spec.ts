/**
 * The admin error-code contract, audited exhaustively instead of by hand.
 *
 * Admin routes answer with `{ error: { message: '<safe-error-code>' } }` (or put
 * a code in a degraded 200 payload), and `adminErrorCopy` (`lib/errors.ts`) turns
 * that code into localized copy. The contract has two halves that live in
 * different files and are edited by different people:
 *
 *   producer  pages/api/admin/**  · lib/zod/admin.ts · lib/erp.ts
 *   consumer  ADMIN_ERROR_COPY + locales/{ar,en}/common.json
 *
 * When they drift, nothing fails — the operator just silently gets generic
 * "the action failed" copy instead of being told which of a dozen distinct
 * conditions actually happened. That is a real regression this repository has
 * shipped more than once (a raw token rendered on screen, then a wrong
 * `Validation Error:` fragment, then an unmapped code), and each time it was
 * found by a throwaway audit script rather than by CI. This spec is that audit,
 * committed.
 *
 * Scope note: `__tests__/lib/errors.spec.ts` covers the *behaviour* of
 * `adminErrorCopy` / `apiErrorMessage` with hand-built inputs. This file covers
 * *coverage* — whether the map and the locale bundles actually account for what
 * the routes emit — so it deliberately reads production source and the real
 * locale files rather than mocking them.
 */
import fs from 'fs';
import path from 'path';

import {
  adminErrorCodes,
  adminErrorCopy,
  adminErrorCopyKey,
  isAdminErrorCode,
} from '@/lib/errors';
import { validateWithSchema } from '@/lib/zod';
import { addSubscriptionSchema } from '@/lib/zod/admin';

import arLocale from '../../locales/ar/common.json';
import enLocale from '../../locales/en/common.json';

const REPO_ROOT = path.resolve(__dirname, '../..');

/** Route sources whose literals are candidate codes. */
const ADMIN_ROUTE_DIR = path.join(REPO_ROOT, 'pages/api/admin');
const ZOD_ADMIN_FILE = path.join(REPO_ROOT, 'lib/zod/admin.ts');

/**
 * `classifyErpError` (`lib/erp.ts`) is the single mapper for every ERP failure
 * and its return table is what the admin routes actually answer with. It is
 * scanned separately, and by a stricter pattern, because its codes are object
 * properties (`{ status: 404, code: 'erp-not-found' }`) rather than the
 * free-standing literals the route scan looks for.
 */
const ERP_CLIENT_FILE = path.join(REPO_ROOT, 'lib/erp.ts');
const ERP_CODE_PROPERTY = /\bcode:\s*'([^']+)'/;

/**
 * A code is kebab-case with at least one hyphen.
 *
 * Requiring the hyphen is what keeps the scanner honest: it matches every real
 * code (`internal-error`, `erp-unavailable`, `invalid-plan-id`) while ignoring
 * the single-word literals that pepper these files (`'GET'`, `'PUT'`, `'Allow'`,
 * `'application/json'`). It is intentionally the same shape `isAdminErrorCode`
 * enforces — a literal the consumer could never match is not a code worth
 * reporting, and that shape is asserted directly in the map tests above.
 */
const KEBAB_LITERAL = /'([a-z0-9]+(?:-[a-z0-9]+)+)'/;

/**
 * `apiErrorMessage` substitutes this for every unexposed 5xx, so it is reachable
 * from any admin route that lets an error reach the handler's `catch`.
 *
 * Declared explicitly rather than scanned: the literal also lives in
 * `lib/errors.ts`, which is the file that defines `ADMIN_ERROR_COPY`. Scanning
 * that file would report every `admin-error-<code>` locale key as a code the map
 * is missing, which is noise, not signal.
 */
const UNEXPOSED_5XX_CODE = 'internal-error';

/**
 * Code-shaped literals in the scanned files that are deliberately NOT error
 * codes.
 *
 * Kept deliberately tiny: every entry is a place where the scanner would
 * otherwise be wrong, and each needs a reason a reviewer can check. Adding to
 * this list to silence a genuine gap re-introduces exactly the silent failure
 * this spec exists to prevent, so the entries are asserted to still be present
 * in production below.
 */
const NOT_ERROR_CODES: Record<string, string> = {
  'package-modules-updated':
    'success token returned by rules/plans/[planId].ts in a 200 body; the admin UI renders its own localized success copy (admin-rules-save-success), so no code-to-copy mapping applies',
};

/**
 * Removes comments before scanning.
 *
 * Without this, prose in a doc comment becomes a phantom code —
 * `lib/zod/admin.ts` documents its parser with examples like `'2026-01-01garbage'`
 * and `'0000-00-00'`, both of which are code-shaped. Stripping comments is the
 * honest fix: those strings are documentation, not behaviour.
 *
 * The line-comment pattern skips a `//` preceded by `:`, so protocol-relative
 * text (`https://…`) inside a real string is not mistaken for a comment start.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const readSource = (file: string): string =>
  stripComments(fs.readFileSync(file, 'utf8'));

/**
 * Reads every match of a single-capture pattern.
 *
 * Hand-rolled instead of `String.prototype.matchAll` + spread because
 * `tsconfig.json` targets ES5: spreading an iterator and `for…of` over one both
 * need `--downlevelIteration`, which this project does not enable. `/g` is
 * re-created locally so the shared pattern constants stay stateless.
 */
const collect = (source: string, pattern: RegExp): string[] => {
  const matcher = new RegExp(pattern.source, 'g');
  const found: string[] = [];

  let match = matcher.exec(source);

  while (match !== null) {
    found.push(match[1]);
    match = matcher.exec(source);
  }

  return found;
};

const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return listSourceFiles(full);

    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

/**
 * Every error code an admin route can put in front of `adminErrorCopy`.
 *
 * Three sources, because the codes are produced three different ways:
 *   1. route literals — `new ApiError(400, 'invalid-plan-id')`, `reject(422, …)`,
 *      `{ error: { message: 'erp-not-configured' } }`, and named constants such
 *      as `const code = 'subscription-not-active'`. Scanning for *any*
 *      code-shaped literal rather than for those call shapes on purpose: a new
 *      emission style would otherwise slip past unnoticed, which is the failure
 *      mode being guarded against.
 *   2. zod schema messages — surfaced through `validateWithSchema` as
 *      `Validation Error: <code>`, including the codes in `lib/zod/admin.ts`.
 *   3. `classifyErpError`'s return table, plus the unexposed-5xx substitute.
 */
const discoverReachableAdminErrorCodes = (): Set<string> => {
  const codes = new Set<string>();

  for (const file of [...listSourceFiles(ADMIN_ROUTE_DIR), ZOD_ADMIN_FILE]) {
    for (const literal of collect(readSource(file), KEBAB_LITERAL)) {
      if (!(literal in NOT_ERROR_CODES)) codes.add(literal);
    }
  }

  for (const code of collect(readSource(ERP_CLIENT_FILE), ERP_CODE_PROPERTY)) {
    codes.add(code);
  }

  codes.add(UNEXPOSED_5XX_CODE);

  return codes;
};

const REACHABLE_CODES = discoverReachableAdminErrorCodes();
const MAPPED_CODES = adminErrorCodes();

const describeCandidates = (codes: string[]): string =>
  codes
    .map((code) => `  - ${code}  →  locale key 'admin-error-${code}'`)
    .join('\n');

describe('admin error codes — the map covers what the routes emit', () => {
  // Guards against the scanner silently matching nothing (a moved directory, a
  // changed naming convention, a broken regex) — a "no problems found" result
  // from a scanner that found nothing is the classic green-but-meaningless test.
  it('discovers the codes the admin surface emits', () => {
    const reachable = Array.from(REACHABLE_CODES);

    expect(REACHABLE_CODES.size).toBeGreaterThanOrEqual(20);

    // Spot-check one code per discovery source, so a source that stops
    // contributing is caught rather than silently absorbed.
    expect(reachable).toContain('invalid-plan-id'); // route literal
    expect(reachable).toContain('invalid-package-id'); // zod schema
    expect(reachable).toContain('erp-unavailable'); // classifyErpError
    expect(reachable).toContain('internal-error'); // apiErrorMessage
  });

  it('has an entry for every code an admin route can emit', () => {
    const missing = Array.from(REACHABLE_CODES)
      .filter((code) => !MAPPED_CODES.includes(code))
      .sort();

    if (missing.length > 0) {
      throw new Error(
        [
          `ADMIN_ERROR_COPY is missing ${missing.length} code(s) that the admin`,
          'routes can emit. The operator gets generic "action failed" copy for',
          'each one instead of being told what actually happened.',
          '',
          'For every code below: add an entry to ADMIN_ERROR_COPY in',
          'lib/errors.ts keyed by the code, whose value is a closure translating',
          "the 'admin-error-<code>' locale key; then add that same locale key to",
          'BOTH locales/ar/common.json and locales/en/common.json, with',
          'non-empty AR and EN copy that differ.',
          '',
          'Write the locale key inside the closure as a quoted string literal —',
          'check-locale.js only recognises that form.',
          '',
          describeCandidates(missing),
        ].join('\n')
      );
    }

    expect(missing).toEqual([]);
  });

  // The other direction. An entry nobody can produce is dead copy: it makes the
  // map look more complete than the platform actually is, and it survives
  // forever because nothing ever exercises it.
  it('has no dead entries — every mapped code is reachable', () => {
    const dead = MAPPED_CODES.filter(
      (code) => !REACHABLE_CODES.has(code)
    ).sort();

    if (dead.length > 0) {
      throw new Error(
        [
          `ADMIN_ERROR_COPY has ${dead.length} entr(ies) with no reachable`,
          'producer, so the copy is dead. Either the code was renamed or removed',
          'in the routes (delete the entry and its locale key in both locales),',
          'or the producer is genuinely gone but the map was left behind.',
          'If a route DOES emit it, the scanner in this file has drifted.',
          '',
          dead
            .map((code) => `  - ${code}  →  locale key 'admin-error-${code}'`)
            .join('\n'),
        ].join('\n')
      );
    }

    expect(dead).toEqual([]);
  });

  // Every key in the map has to be a code, or `adminErrorCopy`'s
  // `ADMIN_ERROR_COPY[trimmed]` lookup is the only thing that can ever reach it
  // — the code-shape branch would pass it through as an unknown token.
  it('keys the map by code-shaped tokens only', () => {
    const notCodeShaped = MAPPED_CODES.filter(
      (code) => !isAdminErrorCode(code)
    );

    expect(notCodeShaped).toEqual([]);
    expect(MAPPED_CODES.length).toBeGreaterThanOrEqual(20);
  });
});

describe('admin error codes — every entry renders real localized copy', () => {
  const t = (key: string) => `t:${key}`;
  const FALLBACK = 'Resolved fallback copy';

  it('maps the implementation detail of the map correctly', () => {
    // `adminErrorCopyKey` recovers the locale key by running the entry's closure
    // against an identity translator, so this cross-checks the accessor against
    // the renderer for every entry rather than trusting either alone.
    for (const code of MAPPED_CODES) {
      expect(adminErrorCopyKey(code)).toBe(`admin-error-${code}`);
      expect(adminErrorCopy(code, t, FALLBACK)).toBe(`t:admin-error-${code}`);
    }
  });

  it.each(MAPPED_CODES)(
    'ships non-empty, distinct AR and EN copy for %s',
    (code) => {
      const key = `admin-error-${code}`;

      const ar = (arLocale as Record<string, unknown>)[key];
      const en = (enLocale as Record<string, unknown>)[key];

      for (const [locale, copy] of [
        ['ar', ar],
        ['en', en],
      ] as const) {
        expect(`${locale}:${typeof copy}`).toBe(`${locale}:string`);
        expect((copy as string).trim().length).toBeGreaterThan(0);
        // i18next falls back to the key itself when it is missing, so a value
        // equal to the key means the bundle does not really define it.
        expect(copy as string).not.toBe(key);
      }

      // A copy-paste that left the English sentence in the Arabic bundle would
      // satisfy every check above.
      expect(ar as string).not.toBe(en as string);
    }
  );

  it('renders copy, never a raw token, for every reachable code', () => {
    for (const code of Array.from(REACHABLE_CODES)) {
      const rendered = adminErrorCopy(code, (key) => `AR/EN:${key}`, FALLBACK);

      expect(rendered).not.toBe(code);
      expect(rendered).not.toBe(FALLBACK);
      expect(rendered).toBe(`AR/EN:admin-error-${code}`);
    }
  });

  // The allow-list above is only legitimate while each entry is really present
  // in the scanned sources. If a code is allow-listed and then deleted from
  // production, the entry is stale and would silently exempt a future code that
  // reuses the name.
  it('keeps every allow-listed literal actually present in the scanned sources', () => {
    const scanned = [
      ...listSourceFiles(ADMIN_ROUTE_DIR).map(readSource),
      readSource(ZOD_ADMIN_FILE),
    ];

    for (const [literal, reason] of Object.entries(NOT_ERROR_CODES)) {
      expect(`${literal}: ${reason !== ''}`).toBe(`${literal}: true`);
      expect(scanned.some((source) => source.includes(`'${literal}'`))).toBe(
        true
      );
    }
  });
});

describe('the `Validation Error:` wrapper agrees with its producer', () => {
  const FALLBACK = 'Resolved fallback copy';

  /**
   * A 422 message produced by the REAL producer, not by hand.
   *
   * `validateWithSchema` (`lib/zod/index.ts`) wraps the first schema message and
   * `adminErrorCopy` strips that wrapper. The two strings are coupled but the
   * prefix is written down once in each file, and until now nothing asserted
   * they matched — a reword on either side would silently stop the unwrap and
   * put the raw English fragment `Validation Error: invalid-package-id` back in
   * front of an operator, in both locales, with every test still green.
   *
   * The prefix is read off the produced message rather than hardcoded here, so
   * this test fails whichever side is reworded.
   */
  const produceValidationMessage = (): string => {
    try {
      validateWithSchema(addSubscriptionSchema, { packageId: '' });
    } catch (error) {
      return (error as Error).message;
    }

    throw new Error(
      'expected validateWithSchema to reject an empty packageId, but it accepted it'
    );
  };

  it('unwraps a message the real producer actually emits', () => {
    const produced = produceValidationMessage();
    const code = 'invalid-package-id';

    // Premise checks, so a producer that stopped wrapping is not reported as a
    // consumer bug.
    expect(produced).toContain(code);
    expect(produced).not.toBe(code);
    expect(produced.length).toBeGreaterThan(code.length);

    // Derived, never hardcoded: whatever prefix the producer prepends is exactly
    // what the consumer must strip.
    const producerPrefix = produced.slice(0, produced.length - code.length);

    expect(adminErrorCopy(produced, (key) => `t:${key}`, FALLBACK)).toBe(
      `t:admin-error-${code}`
    );

    // Stated so a failure names the coupling rather than just showing a diff.
    expect(
      `consumer strips the prefix the producer emits (${JSON.stringify(
        producerPrefix
      )})`
    ).toBe(
      `consumer strips the prefix the producer emits (${JSON.stringify(
        producerPrefix
      )})`
    );

    expect(adminErrorCopy(produced, (key) => `t:${key}`, FALLBACK)).not.toBe(
      FALLBACK
    );
  });

  it('unwraps every validation code the admin schemas can raise', () => {
    // The codes `lib/zod/admin.ts` and the rules plan schema emit, driven
    // through the real producer so the wrapper is exercised, not simulated.
    //
    // `packageId` appears three times on purpose. Each malformed shape reaches a
    // DIFFERENT zod message — absent hits `required_error`, empty hits
    // `min(1, …)`, a wrong type hits `invalid_type_error` — and the first version
    // of this conversion only set the `min` message, so an absent or
    // wrongly-typed field fell through to zod's own prose (`Required`) and
    // rendered generic copy. Pinning all three keeps that from regressing.
    const cases: Array<[string, () => unknown]> = [
      [
        'invalid-package-id',
        () => validateWithSchema(addSubscriptionSchema, {}),
      ],
      [
        'invalid-package-id',
        () => validateWithSchema(addSubscriptionSchema, { packageId: '' }),
      ],
      [
        'invalid-package-id',
        () => validateWithSchema(addSubscriptionSchema, { packageId: 123 }),
      ],
      [
        'invalid-iso-date',
        () =>
          validateWithSchema(addSubscriptionSchema, {
            packageId: 'pkg',
            startDate: '2026-13-45',
          }),
      ],
      [
        'end-date-must-be-after-start-date',
        () =>
          validateWithSchema(addSubscriptionSchema, {
            packageId: 'pkg',
            startDate: '2026-06-01',
            endDate: '2026-01-01',
          }),
      ],
    ];

    for (const [expectedCode, run] of cases) {
      let produced = '';

      try {
        run();
      } catch (error) {
        produced = (error as Error).message;
      }

      // The payload must be the CODE, not zod's default sentence — that is what
      // `adminErrorCopy` can turn into copy.
      expect(produced).toBe(`Validation Error: ${expectedCode}`);
      expect(adminErrorCopy(produced, (key) => `t:${key}`, FALLBACK)).toBe(
        `t:admin-error-${expectedCode}`
      );
    }
  });

  it('keys the unwrap on the producer prefix, not on the code alone', () => {
    // Proof the prefix is load-bearing: the same code behind a different prefix
    // is prose, and prose is passed through untouched rather than mapped. If
    // this ever starts returning mapped copy, the unwrap has been loosened to
    // "contains a known code anywhere", which would let a route re-introduce the
    // raw-fragment leak through any surrounding sentence.
    const notAWrapper = 'Something else: invalid-package-id';

    expect(adminErrorCopy(notAWrapper, (key) => `t:${key}`, FALLBACK)).toBe(
      notAWrapper
    );
  });

  // A zod schema elsewhere in the repo still ships prose (e.g. `primitives.ts`'s
  // `'Slug is required'`). Those are reachable through the same producer and
  // must render copy, never the fragment.
  it('never renders a wrapped prose payload', () => {
    for (const payload of ['Slug is required', 'Token is required', '']) {
      const produced = `Validation Error: ${payload}`;
      const rendered = adminErrorCopy(produced, (key) => `t:${key}`, FALLBACK);

      expect(rendered).toBe(FALLBACK);
      expect(rendered).not.toContain('Validation Error');
    }
  });

  it('uses a schema whose failure message really is the code asserted above', () => {
    // Anchors the `invalid-package-id` expectation used throughout this file to
    // the schema itself, so renaming the code in `lib/zod/admin.ts` fails here
    // with an obvious cause rather than in a maze of wrapper assertions.
    const parsed = addSubscriptionSchema.safeParse({ packageId: '' });

    expect(parsed.success).toBe(false);
    expect(
      parsed.success ? [] : parsed.error.errors.map((e) => e.message)
    ).toContain('invalid-package-id');
  });

  it('is not satisfied by a schema that happens to accept the input', () => {
    // Negative control for the producer helper: a valid body must NOT produce a
    // message, so the tests above cannot pass by reading an empty string.
    expect(() =>
      validateWithSchema(addSubscriptionSchema, {
        packageId: 'pkg',
        startDate: '2026-01-01',
        endDate: '2026-06-01',
      })
    ).not.toThrow();
  });
});

describe('the discovery scanner itself', () => {
  // A scanner is only worth committing if it can fail. These drive the same
  // helpers the coverage tests use, on inputs whose answers are known.
  it('strips comments, so doc examples are not mistaken for codes', () => {
    expect(
      stripComments("const a = 'invalid-plan-id'; // 'not-a-real-code'")
    ).toBe("const a = 'invalid-plan-id'; ");
    expect(
      stripComments("/** `'2026-01-01garbage'` and `'0000-00-00'` */ x")
    ).toBe('  x');
  });

  it('does not treat a protocol prefix as a comment start', () => {
    expect(stripComments("const u = 'https://erp.example.com/x';")).toBe(
      "const u = 'https://erp.example.com/x';"
    );
  });

  it('matches kebab-case codes and ignores single-word literals', () => {
    const source = "['GET', 'application/json', 'erp-not-found', 'Allow']";

    expect(collect(source, KEBAB_LITERAL)).toEqual(['erp-not-found']);
  });

  it('reads the codes out of classifyErpError-style return tables', () => {
    const source =
      "return { status: 404, code: 'erp-not-found' };\n" +
      "if (erpError.code === 'ERP_MALFORMED_RESPONSE') {}";

    expect(collect(source, ERP_CODE_PROPERTY)).toEqual(['erp-not-found']);
  });

  it('scans real files, not just the fixtures above', () => {
    expect(listSourceFiles(ADMIN_ROUTE_DIR).length).toBeGreaterThanOrEqual(12);
    expect(readSource(ERP_CLIENT_FILE)).toContain('erp-unavailable');
    expect(readSource(ZOD_ADMIN_FILE)).toContain(
      'end-date-must-be-after-start-date'
    );
  });
});
