import type { NextApiRequest, NextApiResponse } from 'next';
import { apiErrorStatus, apiErrorMessage } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requirePlatformAdmin(req, res);

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
  } catch (error) {
    console.error('[admin-users] request failed:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}

const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  const { search, q, page = '1', limit = '20' } = req.query;

  const searchQuery = ((search || q || '') as string).trim();
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(
    100,
    Math.max(1, parseInt(limit as string, 10) || 20)
  );
  const skip = (pageNum - 1) * limitNum;

  const where = searchQuery
    ? {
        OR: [
          { name: { contains: searchQuery, mode: 'insensitive' as const } },
          { email: { contains: searchQuery, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        invalid_login_attempts: true,
        lockedAt: true,
        disabledAt: true,
        platformRole: true,
        teamMembers: {
          select: {
            id: true,
            role: true,
            team: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const hasMore = skip + items.length < total;

  return res.status(200).json({
    data: {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      hasMore,
    },
  });
};
