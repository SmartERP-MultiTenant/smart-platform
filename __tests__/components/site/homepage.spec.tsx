/**
 * @jest-environment jsdom
 *
 * The public homepage at `/` is the product's front door: `pages/index.tsx`
 * composes nine band components plus the shared `Navbar` and `Footer` from
 * `components/site/**`. Nothing else renders that whole page, so a band
 * dropping out of the route, a second `<h1>` sneaking in, or the `site`
 * namespace losing a string would all ship unnoticed.
 *
 * What this spec pins, and why each assertion exists:
 *
 * - **Composition.** The nine bands render as direct children of `<main>` in
 *   the reference order, and the header and footer render exactly once each.
 *   The band order is the reference's own band map, so a reordering is a design
 *   change and should fail here rather than ship quietly.
 * - **Exactly one `<h1>`**, owned by the hero band. Several `h1`s is the
 *   classic regression when a band is copied or promoted.
 * - **i18n integrity.** `next-i18next` is mocked against the *real*
 *   `locales/en/site.json`, and the mock returns the key itself for any key the
 *   locale file does not declare. A component that asks for a key which does
 *   not exist therefore renders `site.something` into the DOM and this spec
 *   fails — that is the exact failure mode this project keeps shipping, and it
 *   is invisible to `check-locale` for the template-literal keys in the RT-1
 *   block of `pages/index.tsx`.
 * - **In-page anchors.** Every `/#x` link the chrome renders must resolve to an
 *   element this page actually renders, or the link scrolls nowhere. The chrome
 *   used to link `/#about`, which no band declares; the footer's two "About Us"
 *   links now target the `results` band and this assertion is the real end
 *   state, not a permission list.
 * - **Unique element ids.** Duplicate ids break `htmlFor`/`getElementById` and
 *   are invisible in review. The testimonial star gradient used to be declared
 *   once per star; it is declared once per document now and no id may repeat.
 * - **The shell's font stack.** `Navbar`/`Footer` inherit the font of the shell
 *   that mounts them, and two shells mount them (`pages/index.tsx` and
 *   `PublicLayout`). Both must apply the same public font stack or the same
 *   chrome renders in a different face on `/` than on the other public pages.
 */
import { type ReactElement } from 'react';

import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

import PublicLayout from '@/components/layouts/PublicLayout';
import {
  publicFontFamily,
  publicFontVariables,
} from '@/components/layouts/public-fonts';
import Home from 'pages/index';

/*
 * The translator resolves against the real English locale files rather than
 * echoing the key. Echoing the key (the shorthand the retired landing specs used)
 * would make the "no raw key leaked" assertions below vacuous, because every
 * string on the page would be a key.
 */
jest.mock('next-i18next', () => {
  const dictionaries: Record<string, Record<string, unknown>> = {
    site: jest.requireActual('locales/en/site.json'),
    common: jest.requireActual('locales/en/common.json'),
  };

  return {
    useTranslation: (namespace = 'common') => ({
      t: (key: string) => {
        const dictionary = dictionaries[namespace];
        const value = dictionary?.[key];
        // i18next returns the key itself when the lookup fails; reproducing
        // that is what turns a missing key into a visible defect.
        return value === undefined ? key : value;
      },
    }),
  };
});

jest.mock('next/router', () => ({
  useRouter: () => ({
    locale: 'en',
    pathname: '/',
    asPath: '/',
    query: {},
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

/*
 * `lib/env` is mocked rather than read from the ambient `.env`: this worktree has a
 * `.env` that may set `NEXT_PUBLIC_SUPPORT_URL` while CI does not, so a spec
 * that depended on it would pass locally and fail in CI. An empty value is also
 * the documented "unconfigured" case the site chrome must survive.
 */
jest.mock('lib/env', () => ({
  __esModule: true,
  default: { supportUrl: '' },
}));

/** The bands the route documents, in the order it renders them. */
const DOCUMENTED_BAND_ORDER = [
  'hero',
  'platform',
  'tools',
  'services',
  'results',
  'features',
  'workflow',
  'remote-work',
  'testimonials',
];

/**
 * The homepage shell as Next renders it: `Home.getLayout` is what wraps the
 * page, and it is where the public font stack is declared.
 */
const shellOf = (page: ReactElement) => {
  const getLayout = Home.getLayout;

  if (!getLayout) {
    throw new Error(
      'pages/index.tsx must define getLayout: the shell owns the public font stack'
    );
  }

  return render(<>{getLayout(page)}</>).container
    .firstElementChild as HTMLElement;
};

const SITE_KEY_PATTERN = /site\.[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*/g;

/** Attributes whose value a user or a screen reader can actually read. */
const READABLE_ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];

/**
 * Every text node under `root`, walked individually rather than read from
 * `textContent`: `textContent` glues adjacent keys together (`site.a.title`
 * next to `site.b.title` becomes one string), which would turn a leaked key
 * into an unreadable blob in the failure message.
 */
const textNodesOf = (root: HTMLElement): string[] => {
  const values: string[] = [];

  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        values.push(child.textContent ?? '');
      } else {
        visit(child);
      }
    }
  };

  visit(root);

  return values;
};

/** Attribute values a user or a screen reader can read. */
const readableAttributes = (root: HTMLElement): string[] => {
  const values: string[] = [];

  for (const attr of READABLE_ATTRS) {
    for (const element of Array.from(root.querySelectorAll(`[${attr}]`))) {
      values.push(element.getAttribute(attr) ?? '');
    }
  }

  return values;
};

/** Raw translation keys that leaked into the rendered output, sorted and unique. */
const leakedKeys = (root: HTMLElement): string[] => {
  const found: string[] = [];

  for (const value of textNodesOf(root).concat(readableAttributes(root))) {
    for (const match of value.match(SITE_KEY_PATTERN) ?? []) {
      if (found.indexOf(match) === -1) {
        found.push(match);
      }
    }
  }

  return found.sort();
};

/** In-page `/#anchor` targets the chrome links to, sorted and unique. */
const linkedAnchors = (root: HTMLElement): string[] => {
  const found: string[] = [];

  for (const link of Array.from(root.querySelectorAll('a[href^="/#"]'))) {
    const anchor = (link.getAttribute('href') ?? '').slice('/#'.length);

    if (found.indexOf(anchor) === -1) {
      found.push(anchor);
    }
  }

  return found.sort();
};

const renderHomepage = () => render(<Home />);

describe('the public homepage composition', () => {
  it('renders the nine documented bands, in order, as the children of <main>', () => {
    const { container } = renderHomepage();

    const bands = Array.from(container.querySelectorAll('main > section')).map(
      (band) => band.id
    );

    expect(bands).toEqual(DOCUMENTED_BAND_ORDER);
  });

  it('renders the shared header and footer exactly once each, outside <main>', () => {
    const { container } = renderHomepage();

    // The header is an overlay over the hero, not a band: it is mounted in an
    // absolutely positioned box ahead of `main`, and must not be a band child.
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('main header')).toBeNull();
    expect(container.querySelector('main footer')).toBeNull();
  });

  it('renders exactly one h1, in the hero band', () => {
    const { container } = renderHomepage();

    const h1s = Array.from(container.querySelectorAll('h1'));

    expect(h1s).toHaveLength(1);
    expect(h1s[0].closest('section')?.id).toBe('hero');
  });

  it('renders no duplicate element ids', () => {
    const { container } = renderHomepage();

    const seen: string[] = [];
    const duplicates: string[] = [];

    for (const element of Array.from(container.querySelectorAll('[id]'))) {
      if (
        seen.indexOf(element.id) !== -1 &&
        duplicates.indexOf(element.id) === -1
      ) {
        duplicates.push(element.id);
      }

      seen.push(element.id);
    }

    expect(duplicates).toEqual([]);
  });

  it('renders every band with real copy rather than an empty shell', () => {
    const { container } = renderHomepage();

    const emptyBands = Array.from(container.querySelectorAll('main > section'))
      .filter((band) => (band.textContent ?? '').trim().length === 0)
      .map((band) => band.id);

    expect(emptyBands).toEqual([]);
  });

  it('leaks no raw translation key anywhere the user can read one', () => {
    const { container } = renderHomepage();

    // Guards the assertion below against passing vacuously: if the mocked
    // translator stopped resolving the real locale, the page would render
    // keys everywhere and this check would be the only thing that noticed.
    expect(container.textContent).toContain('SMART PLATFORM');
    expect(leakedKeys(container)).toEqual([]);
  });

  it('resolves every in-page anchor the chrome links to', () => {
    const { container } = renderHomepage();

    const linked = linkedAnchors(container);

    // A page with no in-page links at all would make the check vacuous.
    expect(linked.length).toBeGreaterThan(0);

    const unresolved = linked.filter(
      (anchor) => container.querySelector(`[id="${anchor}"]`) === null
    );

    expect(unresolved).toEqual([]);
  });

  it('gives the shared chrome the same font stack PublicLayout gives it', () => {
    const shell = shellOf(<div />);
    const layout = render(
      <PublicLayout>
        <div />
      </PublicLayout>
    ).container.firstElementChild as HTMLElement;

    // The homepage shell declares the shared stack itself: without it the
    // Arabic nav/footer copy fell through to the UA face on `/` while the same
    // components rendered in Almarai on the other public pages.
    expect(shell.style.fontFamily).toBe(publicFontFamily);
    expect(shell.className).toContain(publicFontVariables);
    expect(layout.style.fontFamily).toBe(shell.style.fontFamily);
  });
});
