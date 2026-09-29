/**
 * CI gate for i18n keys.
 *
 * Semantics (namespace-aware, all locales):
 * 1. Namespaces are discovered from locales/<locale>/<namespace>.json.
 * 2. Every file's resolvable namespaces come from its useTranslation('ns') /
 *    useTranslation(['ns1', 'ns2', ...]) calls (default: 'common'). Legacy
 *    key sources (i18nKey="...", AuthLayout heading=/description=) belong to
 *    the 'common' namespace.
 * 3. A key used in a file must exist — in ALL locales — in at least one of
 *    the file's namespaces.
 * 4. Every key defined in any locale file must be used by at least one file
 *    whose namespace set contains its namespace (or be exempted).
 * 5. Parity: for each namespace, all locales must declare the same BASE key
 *    set. Plural variants (key_one, key_few, ...) are exempt — each language
 *    declares only the plural categories its CLDR rules resolve (en: one/
 *    other; ar: zero/one/two/few/many/other).
 */
const fs = require('fs');
const path = require('path');

const regExp = /\bt\('(.*?)'/gm;
const altRegExp = /\bi18nKey="(.*?)"/gm;
const authHeadingRegExp = /\bheading="(.*?)"/gm;
const authDescriptionRegExp = /\bdescription="(.*?)"/gm;
const nsRegExp = /useTranslation\(\s*(?:\[([^\]]*?)\]|'([a-zA-Z0-9_-]+)')/g;
const nsIdRegExp = /'([a-zA-Z0-9_-]+)'/g;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const exceptionList = [
  'email-verified',
  'allow-only-work-email',
  'verify-account-expired',
  'confirm-your-email',
  'exceeded-login-attempts',
  'account-unlocked',
  'invalid-credentials',
  'no-credentials',
  'token-not-found',
  'user-disabled',
  'account-locked',
  // Dynamic-only ERP funnel error codes surfaced via getErpErrorMessage
  // (server messages map to keys at runtime, never statically).
  'erp-error-invalid-captcha',
  // Returned by POST /api/public/erp/register when the body fails
  // `erpRegistrationSchema`. Reaches the form as `error.message` and is
  // resolved by `getErpErrorMessage`'s `erp-error-` branch at runtime.
  'erp-error-invalid-request',
];

let error = false;

// Discover locales and namespaces from locales/<locale>/<namespace>.json.
// This script lives in scripts/, but locales live at the repo root.
const localesDir = path.join(__dirname, '..', 'locales');
const locales = fs
  .readdirSync(localesDir)
  .filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory())
  .sort();

// nsKeys[namespace][locale] = Set(keys)
const nsKeys = {};
for (const locale of locales) {
  const dir = path.join(localesDir, locale);
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith('.json')) continue;
    const namespace = fileName.replace(/\.json$/, '');
    const json = JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8'));
    nsKeys[namespace] = nsKeys[namespace] || {};
    nsKeys[namespace][locale] = new Set(Object.keys(json));
  }
}

// Strip the plural suffix so ar/en compare on base keys only.
const baseKeys = (keySet) =>
  new Set([...keySet].map((key) => key.replace(PLURAL_SUFFIX, '')));

for (const [namespace, byLocale] of Object.entries(nsKeys)) {
  const missingLocales = locales.filter((locale) => !byLocale[locale]);
  if (missingLocales.length > 0) {
    error = true;
    console.error(
      `Namespace ${namespace} missing locales: ${missingLocales.join(', ')}`
    );
    continue;
  }
  const [firstLocale, ...otherLocales] = locales;
  const firstBase = baseKeys(byLocale[firstLocale]);
  for (const locale of otherLocales) {
    const localeBase = baseKeys(byLocale[locale]);
    for (const key of firstBase) {
      if (!localeBase.has(key)) {
        error = true;
        console.error(
          `Key parity: ${namespace}/${locale} missing key: ${key}`
        );
      }
    }
    for (const key of localeBase) {
      if (!firstBase.has(key)) {
        error = true;
        console.error(
          `Key parity: ${namespace}/${firstLocale} missing key: ${key}`
        );
      }
    }
  }
}

// usedKeys[namespace] = Set(keys resolvable through that namespace)
const usedKeys = {};

// The walk is manual because Node's recursive readdirSync has no prune option:
// it stats the whole tree before any filter runs (~109k entries, 107.9k of them
// under node_modules), which is what made this gate take 20 minutes. Pruning
// node_modules before descending is the whole fix. The prune test is the same
// substring test the old post-filter used on the parent path, so the scanned
// file set is unchanged. Generated directories (.next, coverage, report,
// test-results, playwright-report) are deliberately still walked.
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.includes('node_modules')) continue;
      walk(path.join(dir, entry.name));
    } else if (
      ['.ts', '.tsx'].includes(path.extname(entry.name).toLowerCase())
    ) {
      files.push(path.join(dir, entry.name));
    }
  }
};
walk('.');

files.forEach((filePath) => {
  const fileContent = fs.readFileSync(filePath, 'utf8');

  // Namespaces this file may resolve keys from.
  const namespaces = new Set();
  let nsMatch;
  while ((nsMatch = nsRegExp.exec(fileContent))) {
    if (nsMatch[1] !== undefined) {
      // Array form: useTranslation(['ns1', 'ns2', ...])
      for (const id of nsMatch[1].matchAll(nsIdRegExp)) {
        namespaces.add(id[1]);
      }
    } else {
      // Single form: useTranslation('ns')
      namespaces.add(nsMatch[2]);
    }
  }
  if (namespaces.size === 0) {
    namespaces.add('common');
  }

  const hasLegacyKeys =
    (fileContent.match(altRegExp) || []).length > 0 ||
    (fileContent.match(authHeadingRegExp) || []).length > 0 ||
    (fileContent.match(authDescriptionRegExp) || []).length > 0;
  if (hasLegacyKeys) {
    namespaces.add('common');
  }

  const checkKey = (id) => {
    const owningNamespaces = [...namespaces].filter((ns) =>
      locales.every((locale) => nsKeys[ns]?.[locale]?.has(id))
    );
    if (owningNamespaces.length === 0) {
      error = true;
      console.error(
        `Missing key: ${filePath} - ${id}`
      );
      return;
    }
    owningNamespaces.forEach((ns) => {
      (usedKeys[ns] = usedKeys[ns] || new Set()).add(id);
    });
  };

  (fileContent.match(regExp) || []).forEach((match) => {
    const id = match.replace("t('", '').replace("'", '');
    checkKey(id);
  });

  (fileContent.match(altRegExp) || []).forEach((match) => {
    const id = match.replace('i18nKey="', '').replace('"', '');
    checkKey(id);
  });

  [authHeadingRegExp, authDescriptionRegExp].forEach((regExp) => {
    const authGroups = fileContent.match(regExp) || [];
    authGroups.forEach((match) => {
      const parts = match.replace('AuthLayout ', '');
      parts.split(' ').forEach((part) => {
        const id = part.startsWith('heading=')
          ? part.replace('heading="', '').replace('"', '')
          : part.replace('description="', '').replace('"', '');

        checkKey(id);
      });
    });
  });
});

// Unused keys — per namespace. Parity makes ar/en key sets equal apart from
// plural variants, so iterating the first locale's set covers every locale.
const PLURAL_BASE = /^(.*)_(zero|one|two|few|many|other)$/;
for (const [namespace, byLocale] of Object.entries(nsKeys)) {
  const used = usedKeys[namespace] || new Set();
  for (const key of byLocale[locales[0]] || []) {
    if (used.has(key) || exceptionList.includes(key)) {
      continue;
    }
    // Plural variants are resolved at runtime from the base key with `count`
    // — treat them as used when the base key is used in this namespace.
    const pluralBase = key.match(PLURAL_BASE);
    if (pluralBase && used.has(pluralBase[1])) {
      continue;
    }
    error = true;
    console.error(`Unused key: ${key}`);
  }
}

if (error) {
  process.exit(1);
}
