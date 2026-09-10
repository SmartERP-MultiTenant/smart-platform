import { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import {
  aggregateRevenueData,
  createDegradedRevenuePayload,
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
    const payload = aggregateRevenueData(rawData, 'erp-aggregate');
    res.status(200).json({ data: payload });
  } catch {
    // In case of ERP server downtime or network failure, return 200 with degraded payload
    // so the admin UI renders the Arabic warning banner safely without 500 crash.
    const payload = createDegradedRevenuePayload(
      'تعذر الاتصال بخادم فوترة الـ ERP حالياً — جاري عرض حالة الأمان'
    );
    res.status(200).json({ data: payload });
  }
};
