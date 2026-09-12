jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: { appUrl: 'https://app.example.com' },
}));

jest.mock('@react-email/components', () => ({
  render: jest.fn(async () => '<html />'),
}));

jest.mock('@/components/emailTemplates', () => ({
  RenewalReminder: jest.fn(() => null),
}));

jest.mock('@/lib/email/sendEmail', () => ({
  sendEmail: jest.fn(async () => undefined),
}));

import { render } from '@react-email/components';
import { RenewalReminder } from '@/components/emailTemplates';
import { sendEmail } from '@/lib/email/sendEmail';
import { sendRenewalReminder } from '@/lib/email/sendRenewalReminder';

const renderMock = render as unknown as jest.Mock;
const renewalMock = RenewalReminder as unknown as jest.Mock;
const sendEmailMock = sendEmail as unknown as jest.Mock;

const baseParams = {
  name: 'أحمد',
  email: 'owner@acme.com',
  teamName: 'Acme',
  teamSlug: 'acme',
  daysLeft: 3,
};

describe('sendRenewalReminder — locale-aware CTA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderMock.mockResolvedValue('<html />');
    sendEmailMock.mockResolvedValue(undefined);
  });

  it('defaults to the Arabic (unprefixed) CTA plus an English alternative', async () => {
    await sendRenewalReminder(baseParams);

    expect(renewalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        renewUrl: 'https://app.example.com/teams/acme/erp',
        alternativeRenewUrl: 'https://app.example.com/en/teams/acme/erp',
        alternativeRenewLabel: 'English (Renew Now)',
      })
    );
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@acme.com' })
    );
  });

  it('sends the English CTA with an Arabic alternative when locale is en', async () => {
    await sendRenewalReminder({ ...baseParams, locale: 'en' });

    expect(renewalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        renewUrl: 'https://app.example.com/en/teams/acme/erp',
        alternativeRenewUrl: 'https://app.example.com/teams/acme/erp',
        alternativeRenewLabel: 'بالعربية (تجديد الاشتراك)',
      })
    );
  });
});
