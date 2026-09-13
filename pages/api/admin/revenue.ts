import { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import {
  aggregateRevenueData,
  createDegradedRevenuePayload,
  resolveRevenueSource,
} from '@/lib/adminRevenue';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET':
        await handleGET(req, res);
        break;
      default:
        res.setHeader('Allow', 'GET');
        res.status(405).json({
          error: { message: `Method ${req.method} Not Allowed` },
        });
    }
  } catch (error: any) {
    const status = error.status || 500;
    const message = error.message || 'Something went wrong';
    res.status(status).json({ error: { message } });
  }
}

const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  // Enforce platform admin authentication first
  await requirePlatformAdmin(req, res);

  try {
    const apiKey = env.erp.platformApiKey;
    if (!apiKey) {
      // Degraded state when platform API key is not configured
      const payload = createDegradedRevenuePayload(
        'مفتاح الربط مع نظام الـ ERP غير مهيأ'
      );
      res.status(200).json({ data: payload });
      return;
    }

    const rawData = await erp.listSubscriptionsM2M(apiKey);
    // Source label comes from `lib/adminRevenue.ts` (single source of truth).
    // No mode is passed: only the M2M aggregate endpoint is wired today.
    const payload = aggregateRevenueData(rawData, resolveRevenueSource());
    res.status(200).json({ data: payload });
  } catch (erpErr: any) {
    // Log the real error so we can diagnose it in the Next.js terminal
    console.error('[admin/revenue] ERP call failed:', {
      status: erpErr?.status,
      message: erpErr?.message,
      url: `${process.env.ERP_API_URL}/platform/billing/subscriptions`,
    });
    // Return 200 with degraded payload so the UI never crashes
    const payload = createDegradedRevenuePayload(
      'تعذر الاتصال بخادم فوترة الـ ERP حالياً — جاري عرض حالة الأمان'
    );
    res.status(200).json({ data: payload });
  }
};
