import nodemailer from 'nodemailer';

import env from '../env';

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.password,
  },
});

interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async (data: EmailData) => {
  // Explicit gate: nothing is delivered unless email is enabled AND an SMTP
  // host is configured. Every transactional sender funnels through here.
  if (!env.smtp.enabled || !env.smtp.host) {
    return;
  }

  const emailDefaults = {
    from: env.smtp.from,
  };

  await transporter.sendMail({ ...emailDefaults, ...data });
};
