/**
 * @jest-environment jsdom
 *
 * Contract tests for the shared public-site footer (`components/site/Footer`).
 *
 * The footer is mounted on every public page (the homepage directly,
 * `PublicLayout` for the other seven), so a broken link or a group that stops
 * rendering is a site-wide defect. This spec pins the destinations it is
 * responsible for, the fail-closed behaviour of its contact links, and the
 * `site`/`common` namespaces it resolves from.
 *
 * `lib/env` is mocked: the worktree `.env.local` sets `NEXT_PUBLIC_SUPPORT_URL` and CI does not, so
 * the unconfigured case has to be pinned rather than inherited.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import Footer from '@/components/site/Footer';
import env from 'lib/env';

jest.mock('next-i18next', () => {
  const dictionaries: Record<string, Record<string, unknown>> = {
    site: jest.requireActual('locales/en/site.json'),
    common: jest.requireActual('locales/en/common.json'),
  };

  return {
    useTranslation: (namespace = 'common') => ({
      t: (key: string) => {
        const value = dictionaries[namespace]?.[key];
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

jest.mock('lib/env', () => ({
  __esModule: true,
  default: { supportUrl: '' },
}));

const SITE = jest.requireActual('locales/en/site.json') as Record<
  string,
  unknown
>;
const COMMON = jest.requireActual('locales/en/common.json') as Record<
  string,
  unknown
>;

const mockEnv = env as unknown as { supportUrl: string };

const SUPPORT_URL = 'https://wa.me/966507501490';

/** Every group the footer is documented to render, configured or not. */
const GROUP_TITLE_KEYS = [
  'site.footer.group-platform',
  'site.footer.group-modules',
  'site.footer.group-resources',
  'site.footer.group-legal',
  'site.footer.group-company',
  'site.footer.group-contact',
];

const BADGE_LABEL_KEYS = [
  'site.footer.badge-app-store',
  'site.footer.badge-google-play',
];

const SITE_KEY_PATTERN = /site\.[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*/g;
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

const hrefs = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll('a')).map(
    (link) => link.getAttribute('href') ?? ''
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.supportUrl = '';
});

describe('the shared public-site footer', () => {
  it('links to the product’s real destinations', () => {
    const { container } = render(<Footer />);

    const rendered = hrefs(container);

    for (const destination of [
      '/pricing',
      '/register',
      '/terms',
      '/privacy',
      '/auth/login',
      '/#features',
      '/#testimonials',
      // The two "About Us" links target the `results` band: `/#about` named no
      // band, so the link scrolled nowhere.
      '/#results',
    ]) {
      expect(rendered).toContain(destination);
    }
  });

  it('renders every documented link group', () => {
    const { container } = render(<Footer />);

    const missing = GROUP_TITLE_KEYS.filter(
      (key) => (container.textContent ?? '').indexOf(String(SITE[key])) === -1
    );

    expect(missing).toEqual([]);
  });

  it('renders no external contact link while NEXT_PUBLIC_SUPPORT_URL is unset', () => {
    const { container } = render(<Footer />);

    // An unconfigured channel must not become a dead or guessed link.
    expect(hrefs(container).filter((href) => href.startsWith('http'))).toEqual(
      []
    );
    expect(
      screen.queryByText(String(SITE['site.footer.link-help']))
    ).toBeNull();
    expect(
      screen.queryByText(String(SITE['site.footer.link-live-chat']))
    ).toBeNull();
  });

  it('renders every contact link against the configured channel, safely', () => {
    mockEnv.supportUrl = SUPPORT_URL;

    const { container } = render(<Footer />);

    const contactLinks = Array.from(container.querySelectorAll('a')).filter(
      (link) => link.getAttribute('href') === SUPPORT_URL
    );

    // Resources "Help Centre", "Contact Sales", "Live Chat" and the bottom bar.
    expect(contactLinks.length).toBeGreaterThan(0);

    const unsafe = contactLinks
      .map((link) => ({
        label: link.textContent?.trim() ?? '',
        target: link.getAttribute('target'),
        rel: link.getAttribute('rel'),
      }))
      .filter(
        (link) => link.target !== '_blank' || link.rel !== 'noopener noreferrer'
      );

    expect(unsafe).toEqual([]);

    // Each contact link is rendered twice — once in the desktop link grid and
    // once in the mobile `<details>` accordion — so a link dropped from either
    // renderer fails here. "Help Centre" appears a third time in the bottom
    // bar, which is why only the lower bound is asserted.
    const labels = contactLinks.map((link) => link.textContent?.trim() ?? '');
    const expectedLabels = [
      String(SITE['site.footer.link-contact-sales']),
      String(SITE['site.footer.link-help']),
      String(SITE['site.footer.link-live-chat']),
    ].sort();

    const distinct: string[] = [];

    for (const label of labels) {
      if (distinct.indexOf(label) === -1) {
        distinct.push(label);
      }
    }

    const underRendered = expectedLabels.filter(
      (label) => labels.filter((rendered) => rendered === label).length < 2
    );

    expect(distinct.sort()).toEqual(expectedLabels);
    expect(underRendered).toEqual([]);
  });

  it('renders both store badges, each either a safe link or a disabled chip', () => {
    render(<Footer />);

    /*
     * Whether a badge is an anchor or a non-interactive chip is decided by
     * `process.env.NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL`,
     * read at module scope, so it cannot be pinned from inside a test without
     * re-importing the module. The invariant is asserted instead: a published
     * app is an external link with a real https href and the reverse-tabnabbing
     * guard; an unpublished one is a chip marked `aria-disabled`.
     */
    const findings = BADGE_LABEL_KEYS.map((key) => {
      const label = String(SITE[key]);
      const node = screen.getByText(label);
      const anchor = node.closest('a');
      const href = anchor?.getAttribute('href') ?? '';

      return {
        key,
        anchorWithoutHref: anchor !== null && !/^https:\/\/.+/.test(href),
        unsafeLink:
          anchor !== null &&
          (anchor.getAttribute('target') !== '_blank' ||
            anchor.getAttribute('rel') !== 'noopener noreferrer'),
        deadChip:
          anchor === null && node.closest('[aria-disabled="true"]') === null,
      };
    });

    expect(findings).toEqual(
      BADGE_LABEL_KEYS.map((key) => ({
        key,
        anchorWithoutHref: false,
        unsafeLink: false,
        deadChip: false,
      }))
    );
  });

  it('renders the language switcher, which resolves from the `common` namespace', () => {
    render(<Footer />);

    const switcher = screen.getByLabelText(String(COMMON['switch-lang-aria']));

    expect(switcher).toBeVisible();
    expect(switcher).toHaveTextContent(String(COMMON['switch-lang-label']));
  });

  it('leaks no raw translation key', () => {
    const { container } = render(<Footer />);

    expect(container.textContent).toContain(
      String(SITE['site.footer.tagline'])
    );
    expect(leakedKeys(container)).toEqual([]);
  });
});
