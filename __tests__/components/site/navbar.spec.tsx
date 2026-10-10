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
import { fireEvent, render, screen, within } from '@testing-library/react';
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
// The drawer's scrim and its X button carry the same accessible name, so any query for
// this label has to expect two matches (the scrim first, in DOM order).
const CLOSE_MENU = String(SITE['site.nav.close-menu']);

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

  it('keeps the closed drawer mounted but out of the accessibility tree', () => {
    const { container } = render(<Navbar />);

    const trigger = screen.getByLabelText(OPEN_MENU);
    const drawer = container.querySelector<HTMLElement>(
      '#marketing-mobile-nav'
    );

    // Always mounted: the 300ms open/close transition has to run on a real element.
    expect(drawer).not.toBeNull();
    // Hidden with a real CSS property. A Tailwind `invisible` class alone would still
    // be visible to jsdom's accessibility tree (`queryByRole('dialog')` would leak),
    // which is why the property is inline.
    expect(drawer).toHaveStyle({ visibility: 'hidden' });
    expect(window.getComputedStyle(drawer as HTMLElement).visibility).toBe(
      'hidden'
    );

    // Hidden subtrees are out of the accessibility tree — the same thing
    // `tests/e2e/locale.spec.ts` asserts with a 0 `getByRole('dialog')` count after
    // the drawer closes. Nothing inside the closed drawer is reachable by role.
    //
    // `visibility: hidden` is not what does that for a *closing* drawer: the exit
    // transition keeps the painted element on screen for 300ms, so the property only
    // flips at the end of that window. `inert` + `aria-hidden` are what close the gap —
    // measured in Chromium before this fix, the closed drawer was still in the
    // accessibility tree at 14/57/106/206ms after the close and a Tab walk could enter
    // the scrim and the nav links. `inert` is passed as `''`: React 18 renders no
    // attribute for either boolean value (it logs "Received `true` for a non-boolean
    // attribute" and drops it), so the empty string is the form that actually marks the
    // subtree inert.
    expect(drawer).toHaveAttribute('inert');
    expect(drawer?.getAttribute('inert')).toBe('');
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(drawer as HTMLElement).queryAllByRole('link')).toEqual([]);
    expect(within(drawer as HTMLElement).queryAllByRole('button')).toEqual([]);

    // `visibility: hidden` is also the browser's own rule for dropping a subtree out
    // of the tab order (jsdom's `focus()` does not model tab order at all, so that
    // half is verified in a real browser).
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'marketing-mobile-nav');
  });

  it('traps Tab inside the open drawer and returns focus to the trigger on Escape', () => {
    const { container } = render(<Navbar />);

    const trigger = screen.getByLabelText(OPEN_MENU);

    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    // The scrim is the wrapper's first focusable node and the drawer's last link the
    // last; the trap wraps between those two.
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // The scrim shares its accessible name with the X button, so the X is the second
    // match, and the first match is `first` above.
    const [scrim, closeButton] = screen.getAllByLabelText(CLOSE_MENU);

    expect(focusable.length).toBeGreaterThan(2);
    expect(scrim).toBe(first);
    // Open means fully interactive and fully announced: neither hiding signal is set.
    expect(dialog).not.toHaveAttribute('inert');
    expect(dialog).not.toHaveAttribute('aria-hidden');
    // Opening asks the close button for focus (`closeRef.current?.focus()`), and it has
    // to land in a real browser, not only in jsdom. That is why the drawer's visibility
    // transition is per-state: opening runs `visibility 0s 0s`, which creates no
    // transition at all, so the property is already `visible` when this effect runs. The
    // old shared `transition-[opacity,visibility] duration-300` still computed `hidden`
    // at that instant and Chromium dropped the request (measured in Chromium: the drawer
    // computed `hidden` at the moment of the call and focus was still on the hamburger
    // 600ms after the click), while jsdom honoured it and this suite stayed green.
    expect(document.activeElement).toBe(closeButton);
    expect(dialog.contains(document.activeElement)).toBe(true);

    // The trap itself is unchanged: a Tab arriving from outside the dialog is
    // redirected to the dialog's first node.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    last.focus();
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(first);

    first.focus();
    expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(
      false
    );
    expect(document.activeElement).toBe(last);

    // A Tab in the middle of the drawer is not cancelled: the browser's own movement
    // is what carries focus between two nodes that are both inside the dialog.
    focusable[2].focus();
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(focusable[2]);

    // Escape closes the drawer and hands focus back to the hamburger — otherwise focus
    // would be stranded on a node that just left the accessibility tree.
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');

    // At the moment of the close the drawer is still mounted (the fade-out has to run on
    // a real element) but is already inert and hidden from assistive tech — there is no
    // 300ms window in which it is tabbable or announced.
    const closedDrawer = container.querySelector('#marketing-mobile-nav');

    expect(closedDrawer).not.toBeNull();
    expect(closedDrawer).toHaveAttribute('inert');
    expect(closedDrawer).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaks no raw translation key', () => {
    const { container } = render(<Navbar />);

    expect(container.textContent).toContain(
      String(SITE['site.nav.get-started'])
    );
    expect(leakedKeys(container)).toEqual([]);
  });
});
