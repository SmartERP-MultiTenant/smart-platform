import { DocumentProps, Head, Html, Main, NextScript } from 'next/document';

export default function Document(props: DocumentProps) {
  const currentLocale = props.__NEXT_DATA__?.locale || 'ar';
  const dir = currentLocale === 'ar' ? 'rtl' : 'ltr';

  return (
    <Html lang={currentLocale} dir={dir} className="h-full" data-theme="corporate">
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <body className="h-full">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
