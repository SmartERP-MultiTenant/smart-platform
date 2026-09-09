import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { prisma } from '@/lib/prisma';
import { sendRenewalReminder } from '@/lib/email/sendRenewalReminder';

import { apiErrorStatus, apiErrorMessage } from '@/lib/errors';
import { formatArabicGregorianDate } from '@/lib/email/utils';

/**
 * Constant-time comparison of the provided secret against the configured
 * CRON_SECRET (sha256 digests normalize length — no timing/length leak).
 */
const isCronAuthorized = (
  providedSecret: string | null,
  configuredSecret: string
): boolean => {
  if (!providedSecret) {
    return false;
  }

  const providedDigest = crypto
    .createHash('sha256')
    .update(providedSecret)
    .digest();
  const configuredDigest = crypto
    .createHash('sha256')
    .update(configuredSecret)
    .digest();

  return crypto.timingSafeEqual(providedDigest, configuredDigest);
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
      error: { message: `Method ${req.method} Not Allowed` },
    });
  }

  // Security guard: CRON_SECRET is required for the route to function — there
  // is no open mode (503 when unconfigured). Header auth only (Authorization
  // Bearer or x-cron-secret); the query-string `?secret=` vector was removed
  // because it leaks the secret into access logs.
  const configuredSecret = env.cronSecret;

  if (!configuredSecret) {
    return res.status(503).json({ error: { message: 'cron-not-configured' } });
  }

  const authHeader = req.headers['authorization'];
  const authBearer = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;
  const headerSecret = (req.headers['x-cron-secret'] as string) || null;
  const providedSecret = headerSecret || authBearer;

  if (!isCronAuthorized(providedSecret, configuredSecret)) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  try {
    const teams = await prisma.team.findMany({
      where: {
        erpTenantId: { not: null },
        erpLinkedAt: { not: null },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        erpTenantId: true,
        lastReminderStage: true,
        lastReminderSentAt: true,
        members: {
          where: { role: 'OWNER' },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    let sentCount = 0;
    let skippedCount = 0;
    let resetCount = 0;

    for (const team of teams) {
      if (!team.erpTenantId) continue;

      try {
        const result = (await erp.getTenantBillingSubscription(
          env.erp.platformApiKey,
          team.erpTenantId
        )) as any;

        const sub =
          result?.subscription || result?.data?.subscription || result;
        const endDateStr = sub?.endDate || sub?.subscriptionEndDate;

        if (!endDateStr) {
          skippedCount++;
          continue;
        }

        const endMs = new Date(endDateStr).getTime();
        if (Number.isNaN(endMs)) {
          skippedCount++;
          continue;
        }

        const rawDaysLeft =
          typeof sub?.daysRemaining === 'number' &&
          Number.isFinite(sub.daysRemaining)
            ? sub.daysRemaining
            : Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24));

        // Floor so fractional values (e.g. 7.4) still land inside the T-7
        // milestone window instead of falling through to the renewal-reset
        // branch below (which would cause duplicate T-7 emails). With a daily
        // cron, flooring may fire T-1/EXPIRED up to ~1 day early — harmless
        // for a reminder.
        const daysLeft = Math.floor(rawDaysLeft);

        let targetStage: 'T-7' | 'T-1' | 'EXPIRED' | null = null;
        if (daysLeft <= 0) {
          targetStage = 'EXPIRED';
        } else if (daysLeft <= 1) {
          targetStage = 'T-1';
        } else if (daysLeft <= 7) {
          targetStage = 'T-7';
        }

        // If subscription has been renewed/extended (> 7 days left) and has a previous stage, reset it
        if (targetStage === null && team.lastReminderStage !== null) {
          await prisma.team.update({
            where: { id: team.id },
            data: {
              lastReminderStage: null,
              lastReminderSentAt: null,
            },
          });
          resetCount++;
          continue;
        }

        // Deduplication check: only send once per milestone
        if (targetStage && team.lastReminderStage !== targetStage) {
          const owners = team.members
            .map((m) => m.user)
            .filter((u) => !!u?.email);

          for (const owner of owners) {
            await sendRenewalReminder({
              name: owner.name || 'Admin',
              email: owner.email,
              teamName: team.name,
              teamSlug: team.slug,
              daysLeft,
              endDate: formatArabicGregorianDate(endDateStr),
              milestone: targetStage,
            });
          }

          await prisma.team.update({
            where: { id: team.id },
            data: {
              lastReminderStage: targetStage,
              lastReminderSentAt: new Date(),
            },
          });

          sentCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        console.error(
          `[CRON_RENEWAL_REMINDER_ERROR] Failed processing team ${team.slug}:`,
          err
        );
      }
    }

    return res.status(200).json({
      data: {
        ok: true,
        totalCandidates: teams.length,
        sent: sentCount,
        skipped: skippedCount,
        reset: resetCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[cron-renewal-reminders] request failed:', error);
    return res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}
