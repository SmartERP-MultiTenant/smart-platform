import app from '@/lib/app';
import { SessionProvider } from 'next-auth/react';
import { appWithTranslation } from 'next-i18next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Toaster } from 'react-hot-toast';
import colors from 'tailwindcss/colors';
import type { AppPropsWithLayout } from 'types';
import mixpanel from 'mixpanel-browser';

import '@boxyhq/react-ui/dist/react-ui.css';
import '../styles/globals.css';
import { useEffect } from 'react';
import env from '@/lib/env';
import { Theme, applyTheme } from '@/lib/theme';
import { Themer } from '@boxyhq/react-ui/shared';
import { AccountLayout } from '@/components/layouts';

import nextI18NextConfig from '../next-i18next.config.js';

function MyApp({ Component, pageProps }: AppPropsWithLayout) {
  const { session, ...props } = pageProps;
  const router = useRouter();

  // Keep <html lang/dir> in sync on client-side locale switches: _document
  // only renders on the server, so toggling locale via router.push would
  // otherwise leave the document direction (RTL/LTR) stale.
  useEffect(() => {
    const locale = router.locale || 'ar';
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [router.locale]);

  // Add mixpanel
  useEffect(() => {
    if (env.mixpanel.token) {
      mixpanel.init(env.mixpanel.token, {
        // `debug` is verbose internal logging — development only. It must not
        // depend on the presence of a token, or a production token turns it on.
        debug: process.env.NODE_ENV === 'development',
        // Honour the browser's Do-Not-Track signal. Analytics are
        // non-essential here, so DNT is respected rather than overridden;
        // there is no consent gate that would justify ignoring it.
        ignore_dnt: false,
        track_pageview: true,
      });
    }

    if (env.darkModeEnabled) {
      applyTheme(localStorage.getItem('theme') as Theme);
    }
  }, []);

  const getLayout =
    Component.getLayout || ((page) => <AccountLayout>{page}</AccountLayout>);

  return (
    <>
      <Head>
        <title>{app.name}</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#2548d9" />
      </Head>
      <SessionProvider session={session}>
        <Toaster toastOptions={{ duration: 4000 }} />
        <Themer
          overrideTheme={{
            '--primary-color': colors.blue['500'],
            '--primary-hover': colors.blue['600'],
            '--primary-color-50': colors.blue['50'],
            '--primary-color-100': colors.blue['100'],
            '--primary-color-200': colors.blue['200'],
            '--primary-color-300': colors.blue['300'],
            '--primary-color-500': colors.blue['500'],
            '--primary-color-600': colors.blue['600'],
            '--primary-color-700': colors.blue['700'],
            '--primary-color-800': colors.blue['800'],
            '--primary-color-900': colors.blue['900'],
            '--primary-color-950': colors.blue['950'],
          }}
        >
          {getLayout(<Component {...props} />)}
        </Themer>
      </SessionProvider>
    </>
  );
}

export default appWithTranslation<never>(MyApp, nextI18NextConfig);
