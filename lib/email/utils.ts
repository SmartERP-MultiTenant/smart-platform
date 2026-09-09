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
