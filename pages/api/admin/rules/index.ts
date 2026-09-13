import { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import {
  AdminRulesPayload,
  createDegradedRulesPayload,
} from '@/lib/adminRules';

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
  await requirePlatformAdmin(req, res);

  try {
    const apiKey = env.erp.platformApiKey;
    if (!apiKey) {
      const payload = createDegradedRulesPayload(
        'مفتاح الربط مع نظام الـ ERP غير مهيأ (ERP_PLATFORM_API_KEY)'
      );
      res.status(200).json({ data: payload });
      return;
    }

    const [packages, systemModules] = await Promise.all([
      erp.getPackagesM2M(apiKey),
      erp.getSystemModulesM2M(apiKey),
    ]);

    const payload: AdminRulesPayload = {
      ok: true,
      packages: Array.isArray(packages) ? packages : [],
      systemModules: Array.isArray(systemModules) ? systemModules : [],
    };

    res.status(200).json({ data: payload });
  } catch (err: any) {
    console.error(
      '[ADMIN_RULES_ERP_FETCH_ERROR] Failed to fetch rules from ERP:',
      err?.message || err
    );
    const payload = createDegradedRulesPayload(
      'تعذر الاتصال بخادم الـ ERP لجلب مصفوفة القواعد والموديولات حالياً'
    );
    res.status(200).json({ data: payload });
  }
};
