/**
 * Label resolution for the ERP module list on `/teams/[slug]/erp`.
 *
 * `pages/api/teams/[slug]/erp.ts` narrows the untyped ERP
 * `TenantStatus/modules` payload to `{ code, name }` entries; this module turns
 * one such entry into the single string the page renders.
 *
 * It lives outside the page on purpose. The page pulls in the app shell and
 * cannot be imported by a test — the same constraint that forces the branch
 * table assertions in `__tests__/api/teams-erp-modules.spec.ts` to read source
 * text. Keeping the resolution order here makes it a unit test instead.
 */

/** One normalized ERP module entry: the code that carries the label, plus the ERP's own name. */
export interface ErpModuleEntry {
  code: string;
  name: string;
}

/** The shape of the localizer branch table (`getLocalizedModuleName` in the page). */
export type ModuleBranchTable = (
  token: string,
  translate: (key: string) => string
) => string;

/**
 * The curated translation for an ERP module code, or `null` when the branch
 * table has no branch for it.
 *
 * Membership is decided by whether the branch table actually called `translate`,
 * never by comparing its return value against the token. The comparison would be
 * wrong for `erp-module-crm`, whose English label *is* its code (`CRM`): that
 * branch would read as "no branch" and the caller would fall through to the
 * ERP's Arabic `name` in the English UI.
 */
export const localizeModuleCode = (
  code: string,
  translate: (key: string) => string,
  branchTable: ModuleBranchTable
): string | null => {
  let branched = false;

  const label = branchTable(code, (key) => {
    branched = true;
    return translate(key);
  });

  return branched ? label : null;
};

/**
 * The label for one entry, in the platform's documented order:
 *
 *   1. the curated translation for its `code`;
 *   2. otherwise the ERP's own `name` — the Arabic label the ERP ships;
 *   3. otherwise the raw `code`.
 *
 * Step 2 is what keeps a module the platform has never translated legible — an
 * admin-created `SystemModules` row, or one added to the seeder upstream — where
 * stopping at step 1 would render a bare Latin token in the Arabic UI.
 */
export const resolveModuleLabel = (
  entry: ErpModuleEntry,
  localize: (code: string) => string | null
): string => {
  const code = typeof entry?.code === 'string' ? entry.code.trim() : '';
  const name = typeof entry?.name === 'string' ? entry.name.trim() : '';

  if (code) {
    const localized = localize(code);

    if (localized !== null) {
      return localized;
    }
  }

  return name || code;
};

/**
 * Resolves a whole list and drops the entries that would render an empty badge.
 *
 * The route already drops entries carrying no usable field, so this is the
 * second line of defence: a payload that reached the browser by some other
 * route must not paint an empty chip.
 */
export const moduleLabels = (
  entries: ErpModuleEntry[],
  localize: (code: string) => string | null
): string[] =>
  entries
    .map((entry) => resolveModuleLabel(entry, localize))
    .filter((label) => label.length > 0);
