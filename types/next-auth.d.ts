import type { Role } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      roles: { teamId: string; role: Role }[];
      /** Platform-level admin flag (P5.2). Always a boolean; defaults to false. */
      isPlatformAdmin: boolean;
    };
  }

  interface Profile {
    requested: {
      tenant: string;
    };
    roles: string[];
    groups: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** Platform-level admin claim (P5.2). Advisory only — the DB check in
     * `requirePlatformAdmin` stays authoritative. */
    isPlatformAdmin?: boolean;
    /** Revocation flag: set by the jwt callback when `User.disabledAt` is set.
     * The session callback returns null (unauthenticated) while this flag is
     * present, and `sub` is cleared so the session can no longer resolve a
     * user id. Advisory only — the DB check in the jwt callback is the
     * authority. */
    userDisabled?: boolean;
  }
}
