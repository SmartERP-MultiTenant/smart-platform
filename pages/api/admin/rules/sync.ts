import { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { recordAdminAudit } from '@/lib/adminAudit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'POST':
        await handlePOST(req, res);
        break;
      default:
        res.setHeader('Allow', 'POST');
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

const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  const actor = await requirePlatformAdmin(req, res);
  const { packageId } = req.body || {};

  const apiKey = env.erp.platformApiKey;
  if (!apiKey) {
    res.status(503).json({
      error: { message: 'ERP_PLATFORM_API_KEY is not configured' },
    });
    return;
  }

  try {
    await recordAdminAudit({
      actor,
      action: 'package.modules_sync',
      targetType: 'package',
      targetId: packageId || 'ALL_PACKAGES',
      status: 'STARTED',
      details: { packageId },
    });

    const result = await erp.syncSubscriptionsModulesM2M(apiKey, packageId);

    await recordAdminAudit({
      actor,
      action: 'package.modules_sync',
      targetType: 'package',
      targetId: packageId || 'ALL_PACKAGES',
      status: 'SUCCEEDED',
      details: {
        packageId,
        message: result.message,
      },
    });

    res.status(200).json({ ok: true, result });
  } catch (err: any) {
    await recordAdminAudit({
      actor,
      action: 'package.modules_sync',
      targetType: 'package',
      targetId: packageId || 'ALL_PACKAGES',
      status: 'FAILED',
      errorCode: err?.message || 'ERP_SYNC_FAILED',
      details: { packageId },
    });

    const status = err.status || 500;
    const message = err.message || 'فشلت مزامنة موديولات الاشتراكات مع الـ ERP';
    res.status(status).json({ error: { message } });
  }
};
