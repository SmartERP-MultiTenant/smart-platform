/**
 * @jest-environment jsdom
 *
 * Contract tests for the shared public-site header (`components/site/Navbar`).
 *
 * The header is the only place on the public site that carries a phone number,
 * and it is the owner-approved support channel (WhatsApp +966 50 750 1490,
 * recorded in `docs/env-matrix.md` §3.7 as the `NEXT_PUBLIC_SUPPORT_URL`
 * build-arg). Two ways that promise can break silently: the number stops
 * rendering (the block is conditional on `env.supportUrl || fallback`), or the
 * link starts pointing somewhere that is not the approved channel. Both are
 * asserted here, including the configured-`supportUrl` branch, so the fallback
 * can never be mistaken for the approved destination.
 *
 * The rest of the header's behaviour that a reader would notice if it regressed
 * is pinned too: the nav destinations, the current-page marker, and the
 * offcanvas drawer (Escape closes it and the scroll lock is released).
 *
 * `lib/env` is mocked rather than read from the ambient `.env`: `.env.local` in this
 * worktree sets `NEXT_PUBLIC_SUPPORT_URL` and CI does not, so a spec that
 * depended on the ambient value would pass locally and fail in CI.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import Navbar from '@/components/site/Navbar';
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

const mockEnv = env as unknown as { supportUrl: string };

/**
 * The owner-approved support channel (WhatsApp +966 50 750 1490, approved
 * 2026-09-14 and recorded in `docs/env-matrix.md` §3.7). Both halves are
 * written down here independently of `locales/en/site.json` and of
 * `Navbar.tsx`, so the assertions fail if either is edited to something else.
 */
const APPROVED_NUMBER = '+966 50 750 1490';
const APPROVED_WHATSAPP = 'https://wa.me/966507501490';

const SUPPORT_NUMBER = String(SITE['site.nav.support-number']);
const OPEN_MENU = String(SITE['site.nav.open-menu']);

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

/**
 * The single anchor that displays the support number (the nav item shares its
 * href, so it cannot be found by href alone). Throws with the count when the
 * block is missing, so losing it is a named failure rather than a crash on
 * `undefined`.
 */
const phoneBlock = (root: HTMLElement): HTMLElement => {
  const found = Array.from(root.querySelectorAll('a')).filter((link) =>
    (link.textContent ?? '').includes(SUPPORT_NUMBER)
  );

  if (found.length !== 1) {
    throw new Error(
      `Expected exactly one support-number link, found ${found.length}.`
    );
  }

  return found[0];
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.supportUrl = '';
});

describe('the shared public-site header', () => {
  it('renders the approved support number, linked to the approved WhatsApp channel', () => {
    const { container } = render(<Navbar />);

    // The locale publishes the approved number, and the block renders it in
    // local dev too, where `NEXT_PUBLIC_SUPPORT_URL` is unset.
    expect(SUPPORT_NUMBER).toBe(APPROVED_NUMBER);

    const phone = phoneBlock(container);

    expect(phone).toHaveAttribute('href', APPROVED_WHATSAPP);
    expect(phone).toHaveTextContent(APPROVED_NUMBER);
    expect(phone).toHaveTextContent(String(SITE['site.nav.talk-to-experts']));
  });

  it('opens the support link safely and keeps the number readable in RTL', () => {
    const { container } = render(<Navbar />);

    const phone = phoneBlock(container);

    expect(phone).toHaveAttribute('target', '_blank');
    // Reverse-tabnabbing guard on every `target="_blank"` link.
    expect(phone).toHaveAttribute('rel', 'noopener noreferrer');
    expect(phone).toHaveAttribute(
      'title',
      String(SITE['site.nav.talk-to-experts-cta'])
    );

    // The number is a Latin digit run; `dir="ltr"` is what stops it being
    // reordered by the RTL paragraph direction.
    const numberSpan = Array.from(phone.querySelectorAll('[dir="ltr"]')).filter(
      (span) => (span.textContent ?? '').includes(SUPPORT_NUMBER)
    );

    expect(numberSpan).toHaveLength(1);
  });

  it('lets a configured support URL win the link without changing the displayed number', () => {
    mockEnv.supportUrl = 'https://support.example.com';

    const { container } = render(<Navbar />);

    const phone = phoneBlock(container);

    expect(phone).toHaveAttribute('href', 'https://support.example.com');
    // The published number is locale-owned copy, not a function of the env var.
    expect(phone).toHaveTextContent(SUPPORT_NUMBER);
    expect(hrefs(container)).not.toContain(APPROVED_WHATSAPP);
  });

  it('renders the documented nav destinations', () => {
    const { container } = render(<Navbar />);

    const rendered = hrefs(container);

    for (const destination of [
      '/',
      '/#features',
      '/pricing',
      '/auth/login',
      '/register',
    ]) {
      expect(rendered).toContain(destination);
    }

    // The contact slot carries the approved channel, never an in-page anchor
    // placeholder.
    expect(rendered).toContain(APPROVED_WHATSAPP);
  });

  it('marks the current page link as current', () => {
    const { container } = render(<Navbar />);

    const current = Array.from(
      container.querySelectorAll('a[aria-current="page"]')
    ).map((link) => link.getAttribute('href'));

    expect(current).toContain('/');
    expect(current).not.toContain('/pricing');
    expect(current).not.toContain(APPROVED_WHATSAPP);
  });

  it('opens the offcanvas drawer, locks the page, and closes on Escape', () => {
    render(<Navbar />);

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByLabelText(OPEN_MENU));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute(
      'aria-label',
      String(SITE['site.nav.menu-title'])
    );
    // The drawer is a full-screen overlay: the page behind it must not scroll.
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('leaks no raw translation key', () => {
    const { container } = render(<Navbar />);

    expect(container.textContent).toContain(
      String(SITE['site.nav.get-started'])
    );
    expect(leakedKeys(container)).toEqual([]);
  });
});
