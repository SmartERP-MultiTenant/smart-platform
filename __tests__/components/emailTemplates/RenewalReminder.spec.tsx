/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RenewalReminder } from '@/components/emailTemplates';

// The shared layout runs react-email's Tailwind processor, which is not
// jest-friendly; this spec covers the CTA contract, so render the body only.
jest.mock('@/components/emailTemplates/EmailLayout', () => ({
  __esModule: true,
  default: ({ children }: { children?: unknown }) => children,
}));

const baseProps = {
  name: 'أحمد',
  team: 'Acme',
  subject: 'تذكير بانتهاء الاشتراك',
  daysLeft: 3,
  renewUrl: 'https://app.example.com/teams/acme/erp',
};

describe('RenewalReminder template — locale CTA', () => {
  it('renders the primary CTA and the alternative-language link', () => {
    render(
      RenewalReminder({
        ...baseProps,
        alternativeRenewUrl: 'https://app.example.com/en/teams/acme/erp',
        alternativeRenewLabel: 'English (Renew Now)',
      })
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://app.example.com/teams/acme/erp'
    );
    expect(
      screen.getByRole('link', { name: 'English (Renew Now)' })
    ).toHaveAttribute('href', 'https://app.example.com/en/teams/acme/erp');
  });

  it('omits the alternative link when none is provided', () => {
    render(RenewalReminder(baseProps));

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://app.example.com/teams/acme/erp'
    );
  });
});
