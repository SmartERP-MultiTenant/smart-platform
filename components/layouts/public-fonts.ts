import { Cairo, Almarai, Montserrat } from 'next/font/google';

/**
 * The typefaces the public site's two shells share.
 *
 * The public site has two shells that mount the same `components/site/**`
 * chrome: `PublicLayout` (used by the non-homepage public pages) and the
 * homepage shell in `pages/index.tsx`. Both have to expose the *same* faces on
 * their wrapper element, because the `Navbar`/`Footer` they both render carry no
 * font of their own — they inherit whatever the shell declares. Measured on `/`
 * before this module existed, the homepage shell declared no `font-family`, so
 * the Arabic copy in that page's nav and footer fell through to the UA face
 * (Noto Sans Arabic UI) while the identical components rendered in Almarai on
 * every other public page. Keeping the declarations here is what makes the two
 * shells identical by construction rather than by matching copies.
 *
 * Scope: `pages/index.tsx` and `PublicLayout` are the only consumers, so these
 * faces load on public pages only. Nothing global (`styles/globals.css`,
 * `tailwind.config.js`) and nothing under `components/shared/**` is involved,
 * and the signed-in app keeps the `AccountLayout` faces.
 *
 * - **Almarai** is the site's Arabic face, and the face the retired landing
 *   specified (`fenoise-assets/FENOISE-SPEC.md`); the stack below ends with it,
 *   so Arabic copy resolves per glyph while Latin copy keeps whatever family
 *   precedes it.
 * - **Cairo** is the shell's fallback Arabic face for elements that ask for
 *   `.font-ar` in `styles/globals.css`.
 * - **Montserrat** is the Latin display face for the site wordmark: `.font-en`
 *   reads `--font-montserrat`, so the variable has to reach the header/footer
 *   through an ancestor — both shells render the wordmark with `.font-en`.
 */
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
});

const almarai = Almarai({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '700', '800'],
  variable: '--font-almarai',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['800'],
  variable: '--font-montserrat',
});

/** The `variable` classes both public shells put on their wrapper element. */
export const publicFontVariables = `${cairo.variable} ${almarai.variable} ${montserrat.variable}`;

/** The stack both public shells set on that wrapper element. */
export const publicFontFamily =
  'var(--font-almarai), var(--font-cairo), sans-serif';
