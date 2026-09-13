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
      case 'PUT':
        await handlePUT(req, res);
        break;
      default:
        res.setHeader('Allow', 'PUT');
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

const handlePUT = async (req: NextApiRequest, res: NextApiResponse) => {
  const actor = await requirePlatformAdmin(req, res);
  const { planId } = req.query;

  if (!planId || typeof planId !== 'string') {
    res.status(400).json({ error: { message: 'Invalid plan ID' } });
    return;
  }

  const { systemModuleIds, syncExistingSubscriptions = true } = req.body || {};

  if (!Array.isArray(systemModuleIds)) {
    res.status(422).json({
      error: { message: 'systemModuleIds must be an array of GUIDs' },
    });
    return;
  }

  const apiKey = env.erp.platformApiKey;
  if (!apiKey) {
    res.status(503).json({
      error: { message: 'ERP_PLATFORM_API_KEY is not configured' },
    });
    return;
  }

  try {
    // Record start of audit
    await recordAdminAudit({
      actor,
      action: 'package.modules_update',
      targetType: 'package',
      targetId: planId,
      status: 'STARTED',
      details: {
        newSystemModuleIds: systemModuleIds,
        syncExistingSubscriptions,
      },
    });

    const updatedPackage = await erp.updatePackageModulesM2M(
      apiKey,
      planId,
      systemModuleIds,
      syncExistingSubscriptions
    );

    // Record success in audit
    await recordAdminAudit({
      actor,
      action: 'package.modules_update',
      targetType: 'package',
      targetId: planId,
      status: 'SUCCEEDED',
      after: {
        packageId: updatedPackage.id,
        packageName: updatedPackage.name,
        systemModuleCodes: updatedPackage.systemModuleCodes,
      },
      details: {
        syncExistingSubscriptions,
        modulesCount: systemModuleIds.length,
      },
    });

    res.status(200).json({
      ok: true,
      package: updatedPackage,
      message: 'تم تحديث موديولات الباقة بنجاح',
    });
  } catch (err: any) {
    await recordAdminAudit({
      actor,
      action: 'package.modules_update',
      targetType: 'package',
      targetId: planId,
      status: 'FAILED',
      errorCode: err?.message || 'ERP_UPDATE_FAILED',
      details: {
        attemptedSystemModuleIds: systemModuleIds,
      },
    });

    const status = err.status || 500;
    const message = err.message || 'فشل تحديث موديولات الباقة في الـ ERP';
    res.status(status).json({ error: { message } });
  }
};
