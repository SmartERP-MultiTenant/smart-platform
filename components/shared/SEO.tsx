import Head from 'next/head';
import { useRouter } from 'next/router';
import env from '@/lib/env';

interface SEOProps {
  title: string;
  description?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  ogImageAlt?: string;
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  twitterCard?: 'summary' | 'summary_large_image';
  twitterSite?: string;
}

const siteOrigin = (
  env.appUrl && env.appUrl !== 'undefined'
    ? env.appUrl
    : 'https://platform.smartapro.com'
).replace(/\/+$/, '');

export const defaultOgImage = `${siteOrigin}/og-image.png`;

/**
 * Dimensions/type of the committed `public/og-image.png`. Every caller relies
 * on `defaultOgImage`, so these are accurate for every page that renders SEO.
 */
const ogImageWidth = 1200;
const ogImageHeight = 630;
const ogImageType = 'image/png';

/**
 * Normalises a configured handle to a single leading `@`. Pure so it can be
 * reasoned about without a render; returns `''` for unset/blank/`@`-only input.
 */
export const normaliseTwitterHandle = (value?: string): string => {
  const handle = (value || '').trim().replace(/^@+/, '').replace(/\s+/g, '');

  return handle ? `@${handle}` : '';
};

/**
 * The brand's X/Twitter handle is deliberately NOT hardcoded: it is supplied
 * via `NEXT_PUBLIC_TWITTER_HANDLE` (build-time inlined at `next build`, like
 * every other `NEXT_PUBLIC_*` in this repo). When it is unset we omit
 * `twitter:site` entirely rather than advertise a handle we cannot verify.
 */
export const defaultTwitterSite = normaliseTwitterHandle(
  process.env.NEXT_PUBLIC_TWITTER_HANDLE
);

export const SEO = ({
  title,
  description,
  ogType = 'website',
  ogImage = defaultOgImage,
  ogImageAlt,
  noIndex = false,
  jsonLd,
  twitterCard = 'summary_large_image',
  twitterSite = defaultTwitterSite,
}: SEOProps) => {
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const imageAlt = ogImageAlt || title;
  const path = router.asPath.split('?')[0];
  const canonicalUrl = `${siteOrigin}${currentLocale === 'en' ? '/en' : ''}${
    path === '/' ? '' : path
  }`;

  return (
    <Head>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}

      {/* Robots Directive */}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* OpenGraph Tags */}
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content={String(ogImageWidth)} />
      <meta property="og:image:height" content={String(ogImageHeight)} />
      <meta property="og:image:type" content={ogImageType} />
      <meta property="og:image:alt" content={imageAlt} />
      <meta property="og:site_name" content="SMART PLATFORM" />
      <meta
        property="og:locale"
        content={currentLocale === 'ar' ? 'ar_SA' : 'en_US'}
      />
      {currentLocale === 'ar' ? (
        <meta property="og:locale:alternate" content="en_US" />
      ) : (
        <meta property="og:locale:alternate" content="ar_SA" />
      )}

      {/* Twitter Cards */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={imageAlt} />
      {twitterSite && <meta name="twitter:site" content={twitterSite} />}

      {/* Structured Data (JSON-LD) */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
      )}
    </Head>
  );
};

export default SEO;
