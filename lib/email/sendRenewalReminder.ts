import { render } from '@react-email/components';
import { sendEmail } from './sendEmail';
import { RenewalReminder } from '@/components/emailTemplates';
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
}

export const sendRenewalReminder = async ({
  name,
  email,
  teamName,
  teamSlug,
  daysLeft,
  endDate,
}: SendRenewalReminderParams) => {
  const renewUrl = `${env.appUrl}/teams/${encodeURIComponent(teamSlug)}/erp`;

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
    })
  );

  await sendEmail({
    to: email,
    subject,
    html,
  });
};
