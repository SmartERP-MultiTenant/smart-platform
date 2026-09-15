/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import TrustStrip from '@/components/landing/TrustStrip';
import env from '@/lib/env';
import useSWR from 'swr';

// The translator returns the key itself, so a rendered key proves the lookup
// happened and a rendered literal proves it did not.
jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `lib/env` is mocked rather than read from `.env`: this worktree has a local
// `.env` that sets NEXT_PUBLIC_SUPPORT_URL, but CI does not, so a test that
// depended on the ambient value would pass locally and fail in CI. Pinning it
// here also lets the same spec cover the configured and unconfigured cases.
jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: { supportUrl: '' },
}));

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;
const mockEnv = env as unknown as { supportUrl: string };

const SUPPORT_URL = 'https://wa.me/966507501490';
const FALLBACK_LABELS = [
  'Mastercard',
  'Visa',
  'mada',
  'Apple Pay',
  'stc pay',
  'tabby',
  'tamara',
];

/** `data` is what SWR would hand the component: undefined while loading/failed. */
const setCatalogue = (data: unknown) => {
  mockedUseSWR.mockReturnValue({ data, error: undefined, isLoading: false });
};

const method = (
  key: string,
  label: string,
  available: boolean,
  iconUrl?: string
) => ({ key, label, available, ...(iconUrl ? { iconUrl } : {}) });

const renderStrip = () => render(<TrustStrip />);

const brandRow = () =>
  document.querySelector('[dir="ltr"]') as HTMLElement | null;

const brandTexts = () =>
  Array.from(brandRow()?.querySelectorAll('span') ?? []).map(
    (el) => el.textContent
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.supportUrl = '';
  setCatalogue(undefined);
});

describe('TrustStrip — live gateway marks (P2.15 + PG-22)', () => {
  describe('while the catalogue is loading (or after it failed)', () => {
    it('server-renders the fallback marks instead of an empty strip', () => {
      renderStrip();

      expect(screen.getByText('landing-truststrip-gateways')).toBeVisible();
      expect(brandTexts()).toEqual(FALLBACK_LABELS);
    });

    it('never advertises Samsung Pay (P2.10 closed / PG-45)', () => {
      renderStrip();

      expect(screen.queryByText('Samsung Pay')).toBeNull();
      expect(document.body.textContent).not.toMatch(/samsung/i);
    });
  });

  describe('a readable catalogue is authoritative', () => {
    it('renders only the methods the ERP marks available', () => {
      setCatalogue({
        data: [
          method('card', 'Mastercard', true),
          method('tabby', 'tabby', false),
          method('mada', 'mada', true),
        ],
      });

      renderStrip();

      expect(brandTexts()).toEqual(['Mastercard', 'mada']);
    });

    it('omits the whole gateways block when nothing is available, keeping VAT', () => {
      setCatalogue({
        data: [
          method('card', 'Mastercard', false),
          method('tabby', 'tabby', false),
        ],
      });

      renderStrip();

      // Advertising anything here is the exact defect PG-22 exists to fix.
      expect(screen.queryByText('landing-truststrip-gateways')).toBeNull();
      expect(brandRow()).toBeNull();
      // …and the strip is still a strip, not a broken layout.
      expect(screen.getByText('landing-truststrip-tax')).toBeVisible();
    });

    it('treats a missing `available` as unavailable (fail-closed)', () => {
      setCatalogue({
        data: [{ key: 'a', label: 'Unproven' }, method('b', 'Verified', true)],
      });

      renderStrip();

      expect(brandTexts()).toEqual(['Verified']);
    });

    it('renders the ERP icon alongside the label', () => {
      setCatalogue({
        data: [
          method('card', 'Visa', true, 'https://cdn.example.com/visa.svg'),
        ],
      });

      renderStrip();

      const img = brandRow()?.querySelector('img');
      expect(img).toHaveAttribute('src', 'https://cdn.example.com/visa.svg');
      // Decorative: the label is the accessible name.
      expect(img).toHaveAttribute('alt', '');
      expect(screen.getByText('Visa')).toBeVisible();
    });

    it('does not render an image for a rejected icon URL', () => {
      setCatalogue({
        data: [method('card', 'Visa', true, 'http://cdn.example.com/v.svg')],
      });

      renderStrip();

      expect(brandRow()?.querySelector('img')).toBeNull();
      expect(screen.getByText('Visa')).toBeVisible();
    });
  });

  describe('the VAT mark (unchanged, always rendered)', () => {
    it('renders the tax key in both the fallback and the live path', () => {
      renderStrip();
      expect(screen.getByText('landing-truststrip-tax')).toBeVisible();

      setCatalogue({ data: [method('card', 'Visa', true)] });
      render(<TrustStrip />);
      expect(
        screen.getAllByText('landing-truststrip-tax').length
      ).toBeGreaterThan(0);
    });
  });

  describe('the contact channel (P1.3)', () => {
    it('renders no contact affordance while NEXT_PUBLIC_SUPPORT_URL is empty', () => {
      renderStrip();

      expect(screen.queryByText('landing-truststrip-whatsapp')).toBeNull();
      expect(document.querySelector(`a[href="${SUPPORT_URL}"]`)).toBeNull();
    });

    it('renders the WhatsApp pill as a safe external link once configured', () => {
      mockEnv.supportUrl = SUPPORT_URL;
      renderStrip();

      const pill = screen.getByText('landing-truststrip-whatsapp');
      expect(pill).toBeVisible();

      const link = pill.closest('a');
      expect(link).toHaveAttribute('href', SUPPORT_URL);
      expect(link).toHaveAttribute('target', '_blank');
      // Reverse-tabnabbing guard on every `target="_blank"` link.
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('gives the link a non-empty accessible name', () => {
      mockEnv.supportUrl = SUPPORT_URL;
      renderStrip();

      const link = screen
        .getByText('landing-truststrip-whatsapp')
        .closest('a') as HTMLAnchorElement;

      expect(link.textContent?.trim().length).toBeGreaterThan(0);
    });
  });
});
