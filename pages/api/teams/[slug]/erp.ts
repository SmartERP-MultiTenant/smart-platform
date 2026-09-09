import { NextApiRequest, NextApiResponse } from 'next';

import { prisma } from '@/lib/prisma';
import env from '@/lib/env';
import { erp, ErpApiError, ErpLoginResult } from '@/lib/erp';
import { throwIfNoTeamAccess } from 'models/team';
import { erpConnectSchema } from '@/lib/zod/erp';
import { encryptErpToken, decryptErpToken } from '@/lib/crypto/erpToken';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET':
        await handleGET(req, res);
        break;
      case 'POST':
        await handlePOST(req, res);
        break;
      default:
        res.setHeader('Allow', 'GET, POST');
        res.status(405).json({
          error: { message: `Method ${req.method} Not Allowed` },
        });
    }
  } catch (error: any) {
    const message = error.message || 'Something went wrong';
    const status = error.status || 500;

    res.status(status).json({ error: { message } });
  }
}

// Get the linked ERP subscription status + enabled modules
const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  const teamMember = await throwIfNoTeamAccess(req, res);
  const team = teamMember.team;

  if (!team.erpAccessToken) {
    res.json({ data: { linked: false } });
    return;
  }

  try {
    const rawToken = decryptErpToken(team.erpAccessToken);
    const [subscription, modules] = await Promise.all([
      erp.getTenantSubscription(rawToken),
      erp.getTenantModules(rawToken),
    ]);

    res.json({
      data: {
        linked: true,
        tenantId: team.erpTenantId,
        subdomain: team.erpSubdomain,
        subscription,
        modules,
      },
    });
  } catch {
    res.json({
      data: {
        linked: true,
        error: 'erp-unreachable',
        subdomain: team.erpSubdomain,
      },
    });
  }
};

// Link the kit team to an ERP tenant via tenant admin credentials
const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  const teamMember = await throwIfNoTeamAccess(req, res);
  const team = teamMember.team;

  const parsed = erpConnectSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message || 'invalid-input',
      },
    });
    return;
  }

  const { subdomain, adminUserName, adminPassword } = parsed.data;

  let result: ErpLoginResult;

  try {
    result = await erp.login(adminUserName, adminPassword);
  } catch (error: any) {
    if (
      error instanceof ErpApiError &&
      (error.status === 401 || error.status === 404)
    ) {
      res.status(401).json({ error: { message: 'invalid-credentials' } });
      return;
    }

    throw error;
  }

  if (result.authToken) {
    await prisma.team.update({
      where: { id: team.id },
      data: {
        erpTenantId: result.tenantId ? String(result.tenantId) : null,
        erpSubdomain: subdomain,
        erpApiUrl: env.erp.apiUrl,
        erpAccessToken: encryptErpToken(result.authToken),
        erpLinkedAt: new Date(),
      },
    });

    res.json({ data: { linked: true, tenantId: result.tenantId } });
    return;
  }

  if (result.userId) {
    res.status(400).json({ error: { message: 'otp-required' } });
    return;
  }

  res.status(401).json({ error: { message: 'invalid-credentials' } });
};
