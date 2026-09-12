import env from '../env';
import blockedDomains from './freeEmailService.json';

const isBusinessEmail = (email: string) => {
  if (email.indexOf('@') > 0 && email.indexOf('@') < email.length - 3) {
    const emailDomain = email.split('@')[1];

    return !blockedDomains[emailDomain];
  }
};

export const isEmailAllowed = (email: string) => {
  if (!env.disableNonBusinessEmailSignup) {
    return true;
  }

  return isBusinessEmail(email);
};

export function extractEmailDomain(email: string) {
  return email.split('@')[1];
}

export type EmailLocale = 'ar' | 'en';

/**
 * Locale-aware URL for the team ERP page (renewal CTA target).
 *
 * Mirrors the repo's locale-URL convention (`components/shared/SEO.tsx`,
 * `pages/_document.tsx`): the default locale (Arabic) is unprefixed and English
 * lives under `/en`. Middleware also negotiates EN browsers arriving on an
 * unprefixed link, but an explicit prefix keeps the target deterministic for
 * email recipients, whose mail client or preview pane does not always
 * negotiate.
 */
export const buildRenewalUrl = (
  appUrl: string,
  teamSlug: string,
  locale: EmailLocale = 'ar'
): string => {
  const origin = appUrl.replace(/\/+$/, '');
  const localePrefix = locale === 'en' ? '/en' : '';

  return `${origin}${localePrefix}/teams/${encodeURIComponent(teamSlug)}/erp`;
};

/**
 * Gregorian-calendar Arabic date for transactional emails.
 *
 * `toLocaleDateString('ar-SA')` renders Hijri (Umm al-Qura) dates by default,
 * which would be confusing next to Gregorian subscription end dates from the
 * ERP. `ar-EG` keeps the Arabic presentation (Arabic-Indic digits) on the
 * Gregorian calendar, matching the ERP UI (pages/teams/[slug]/erp.tsx).
 */
export const formatArabicGregorianDate = (iso: string | Date): string =>
  new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
