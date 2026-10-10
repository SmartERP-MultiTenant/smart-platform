import { type ReactNode } from 'react';
import { useRouter } from 'next/router';

import Footer from '@/components/site/Footer';
import Navbar from '@/components/site/Navbar';
import {
  publicFontFamily,
  publicFontVariables,
} from '@/components/layouts/public-fonts';

interface PublicLayoutProps {
  children: ReactNode;
}

/**
 * The shared chrome for the public site.
 *
 * It mounts the same `Navbar` and `Footer` the homepage uses
 * (`pages/index.tsx`), in flow rather than as an overlay: the homepage hero owns
 * the top of the document and pulls the header under itself, while every other
 * public page has no hero and needs the header to occupy its own row.
 *
 * `Navbar`/`Footer` resolve their copy from the `site` namespace, so every page
 * that renders this layout must pass `site` to `serverSideTranslations`.
 *
 * The public faces (`next/font`) come from `./public-fonts`, the module the
 * homepage shell reads too: both shells mount the same chrome, and the chrome
 * inherits the shell's font stack.
 *
 * The retired `LandingHeader`'s `compact` variant (brand + language only, used
 * by the two payment status pages) has no counterpart in the site `Navbar`, so
 * it is gone along with the prop: every public page gets the same chrome.
 */
export default function PublicLayout({ children }: PublicLayoutProps) {
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const isRtl = currentLocale === 'ar';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={currentLocale}
      className={`min-h-screen bg-[var(--ds-surface)] text-[var(--ds-text)] ${publicFontVariables}`}
      style={{ fontFamily: publicFontFamily }}
    >
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
