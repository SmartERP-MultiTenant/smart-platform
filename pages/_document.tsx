import { DocumentProps, Head, Html, Main, NextScript } from 'next/document';

import env from '@/lib/env';

// Canonical/hreflang origin. APP_URL is the authoritative per-deployment
// origin (used for OAuth callbacks and webhooks). Guard against the unset
// template-literal "undefined" value and fall back to the production domain.
const siteOrigin = (
  env.appUrl && env.appUrl !== 'undefined'
    ? env.appUrl
    : 'https://www.smartapro.com'
).replace(/\/+$/, '');

export default function Document(props: DocumentProps) {
  const currentLocale = props.__NEXT_DATA__?.locale || 'ar';
  const dir = currentLocale === 'ar' ? 'rtl' : 'ltr';

  // Page route (e.g. '/pricing'); accurate for all static public pages.
  // Dynamic route segments resolve to their pattern — acceptable for the
  // canonical of auth-gated pages only.
  const page = props.__NEXT_DATA__?.page || '/';
  const path = page === '/' ? '' : page.replace(/\/$/, '');

  // Default locale 'ar' has no URL prefix; 'en' is served under /en.
  const localeUrl = (locale: string) =>
    `${siteOrigin}${locale === 'en' ? '/en' : ''}${path}`;

  return (
    <Html
      lang={currentLocale}
      dir={dir}
      className="h-full"
      data-theme="corporate"
    >
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="canonical" href={localeUrl(currentLocale)} />
        <link rel="alternate" hrefLang="ar" href={localeUrl('ar')} />
        <link rel="alternate" hrefLang="en" href={localeUrl('en')} />
        <link rel="alternate" hrefLang="x-default" href={localeUrl('ar')} />
      </Head>
      <body className="h-full">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
