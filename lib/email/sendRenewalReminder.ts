import { render } from '@react-email/components';
import { sendEmail } from './sendEmail';
import { RenewalReminder } from '@/components/emailTemplates';
import { buildRenewalUrl, EmailLocale } from '@/lib/email/utils';
import app from '@/lib/app';
import env from '@/lib/env';

export interface SendRenewalReminderParams {
  name: string;
  email: string;
  teamName: string;
  teamSlug: string;
  daysLeft: number;
  endDate?: string;
  milestone?: 'T-7' | 'T-1' | 'EXPIRED';
  /** Recipient-facing language of the CTA. Defaults to 'ar' (market default). */
  locale?: EmailLocale;
}

export const sendRenewalReminder = async ({
  name,
  email,
  teamName,
  teamSlug,
  daysLeft,
  endDate,
  locale = 'ar',
}: SendRenewalReminderParams) => {
  const isEnglish = locale === 'en';
  const renewUrl = buildRenewalUrl(
    env.appUrl,
    teamSlug,
    isEnglish ? 'en' : 'ar'
  );
  // Always offer the other language's CTA as a secondary link so a recipient
  // reading the wrong language still lands on the right flow.
  const alternativeRenewUrl = buildRenewalUrl(
    env.appUrl,
    teamSlug,
    isEnglish ? 'ar' : 'en'
  );
  const alternativeRenewLabel = isEnglish
    ? 'بالعربية (تجديد الاشتراك)'
    : 'English (Renew Now)';

  let subject: string;
  if (daysLeft <= 0) {
    subject = `⚠️ تنبيه: انتهى اشتراك منشأة ${teamName} في ${app.name}`;
  } else if (daysLeft === 1) {
    subject = `⏳ تذكير عاجل: ينتهي اشتراك منشأة ${teamName} غداً`;
  } else {
    subject = `📅 تذكير: يتبقى ${daysLeft} أيام على انتهاء اشتراك منشأة ${teamName}`;
  }

  const html = await render(
    RenewalReminder({
      name,
      team: teamName,
      subject,
      daysLeft,
      endDate,
      renewUrl,
      alternativeRenewUrl,
      alternativeRenewLabel,
    })
  );

  await sendEmail({
    to: email,
    subject,
    html,
  });
};
