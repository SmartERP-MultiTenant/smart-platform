import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from 'next';

import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

/**
 * Safe actor identity returned for audit logging. Never contains
 * passwords, session tokens, ERP access tokens, or API keys.
 */
export type PlatformAdminActor = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * Single server-side authority for platform-admin access (P5.2).
 *
 * Use in every `/api/admin/*` route and in `getServerSideProps` of `/admin`
 * pages BEFORE any business logic:
 *
 *   const actor = await requirePlatformAdmin(req, res);
 *
 * - 401 when there is no session at all.
 * - 403 when the current database role is not `PLATFORM_ADMIN`.
 *
 * The database is the source of truth: a stale `isPlatformAdmin` JWT claim
 * cannot keep a revoked admin working for the rest of the token lifetime.
 * `middleware.ts` adds a defense-in-depth route gate on top of this helper,
 * but this helper must stay the real authority.
 */
export const requirePlatformAdmin = async (
  req: NextApiRequest | GetServerSidePropsContext['req'],
  res: NextApiResponse | GetServerSidePropsContext['res']
): Promise<PlatformAdminActor> => {
  const session = await getSession(req, res);

  if (!session?.user?.id) {
    throw new ApiError(401, 'Unauthorized');
  }

  // Fresh database check with a narrow select — the session claim alone is
  // not trusted, and no credential material is ever read or returned.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
    },
  });

  if (!user || user.platformRole !== 'PLATFORM_ADMIN') {
    throw new ApiError(403, 'Forbidden');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
};
