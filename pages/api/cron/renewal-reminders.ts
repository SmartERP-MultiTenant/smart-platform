import type { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { prisma } from '@/lib/prisma';
import { sendRenewalReminder } from '@/lib/email/sendRenewalReminder';

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

  // Security guard: verify CRON_SECRET if configured
  const authHeader = req.headers['authorization'];
  const authBearer = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;
  const headerSecret = req.headers['x-cron-secret'] as string;
  const querySecret = req.query.secret as string;
  const providedSecret = headerSecret || authBearer || querySecret;

  if (env.cronSecret && providedSecret !== env.cronSecret) {
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

        const daysLeft =
          typeof sub?.daysRemaining === 'number'
            ? sub.daysRemaining
            : Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24));

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
              endDate: new Date(endDateStr).toLocaleDateString('ar-SA'),
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
  } catch (error: any) {
    const message = error.message || 'Internal Server Error';
    return res.status(500).json({ error: { message } });
  }
}
