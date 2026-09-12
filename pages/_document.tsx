import Document, {
  type DocumentContext,
  type DocumentInitialProps,
  Head,
  Html,
  Main,
  NextScript,
} from 'next/document';

import env from '@/lib/env';

// Canonical/hreflang origin. APP_URL is the authoritative per-deployment
// origin (used for OAuth callbacks and webhooks). Guard against the unset
// template-literal "undefined" value and fall back to the production domain.
const siteOrigin = (
  env.appUrl && env.appUrl !== 'undefined'
    ? env.appUrl
    : 'https://platform.smartapro.com'
).replace(/\/+$/, '');

type CustomDocumentProps = {
  nonce?: string;
};

class CustomDocument extends Document<CustomDocumentProps> {
  /**
   * P2.13: `middleware.ts` mints a per-request CSP nonce and exposes it as the
   * `x-nonce` request header. It has to reach the tags Next renders because
   * `script-src` no longer allows `'unsafe-inline'` — reading it here and
   * forwarding it to `Head`/`NextScript` is the Pages Router half of the
   * mechanism (the App Router would pick it up from the CSP request header
   * automatically).
   */
  static async getInitialProps(
    ctx: DocumentContext
  ): Promise<DocumentInitialProps & CustomDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx);
    const headerNonce = ctx.req?.headers?.['x-nonce'];
    const nonce = Array.isArray(headerNonce) ? headerNonce[0] : headerNonce;

    return { ...initialProps, nonce };
  }

  render() {
    const { nonce, __NEXT_DATA__ } = this.props;
    const currentLocale = __NEXT_DATA__?.locale || 'ar';
    const dir = currentLocale === 'ar' ? 'rtl' : 'ltr';

    // Page route (e.g. '/pricing'); accurate for all static public pages.
    // Dynamic route segments resolve to their pattern — acceptable for the
    // canonical of auth-gated pages only.
    const page = __NEXT_DATA__?.page || '/';
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
        <Head nonce={nonce}>
          <link rel="icon" href="/favicon.ico" sizes="any" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="canonical" href={localeUrl(currentLocale)} />
          <link rel="alternate" hrefLang="ar" href={localeUrl('ar')} />
          <link rel="alternate" hrefLang="en" href={localeUrl('en')} />
          <link rel="alternate" hrefLang="x-default" href={localeUrl('ar')} />
        </Head>
        <body className="h-full">
          <Main />
          <NextScript nonce={nonce} />
        </body>
      </Html>
    );
  }
}

export default CustomDocument;
