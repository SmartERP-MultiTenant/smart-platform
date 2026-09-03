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
  }
}
