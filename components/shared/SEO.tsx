import Head from 'next/head';
import { useRouter } from 'next/router';
import env from '@/lib/env';

interface SEOProps {
  title: string;
  description?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  twitterCard?: 'summary' | 'summary_large_image';
}

const siteOrigin = (
  env.appUrl && env.appUrl !== 'undefined'
    ? env.appUrl
    : 'https://platform.smartapro.com'
).replace(/\/+$/, '');

export const defaultOgImage = `${siteOrigin}/og-image.png`;

export const SEO = ({
  title,
  description,
  ogType = 'website',
  ogImage = defaultOgImage,
  noIndex = false,
  jsonLd,
  twitterCard = 'summary_large_image',
}: SEOProps) => {
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
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
