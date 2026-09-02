/** Logically formatted date helpers shared by dashboard components. */

export const formatDate = (iso: string, language = 'en'): string => {
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
};

/** `YYYY-MM` → e.g. "Mar 2026". */
export const formatMonth = (month: string, language = 'en'): string => {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(language, {
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, monthIndex - 1, 1));
};
