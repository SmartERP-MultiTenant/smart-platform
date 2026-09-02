import jackson, {
  IConnectionAPIController,
  IDirectorySyncController,
  IOAuthController,
  JacksonOption,
  ISPSSOConfig,
  OIDCAuthzResponsePayload,
} from '@boxyhq/saml-jackson';

export type { OIDCAuthzResponsePayload };

import env from './env';

const opts = {
  externalUrl: env.appUrl,
  samlPath: env.jackson.sso.path,
  oidcPath: env.jackson.sso.oidcPath,
  samlAudience: env.jackson.sso.issuer,
  db: {
    engine: 'sql',
    type: 'postgres',
    url: env.databaseUrl,
  },
  idpDiscoveryPath: '/auth/sso/idp-select',
  idpEnabled: true,
  openid: {},
} as JacksonOption;

let apiController: IConnectionAPIController;
let oauthController: IOAuthController;
let directorySync: IDirectorySyncController;
let spConfig: ISPSSOConfig;

const g = global as any;

// Promise-memoized initialization: concurrent first callers must share ONE
// jackson(opts) init. The controller init lazily generates the default SP
// X.509 certificate and inserts it into jackson_store; racing initializations
// on a fresh database make the second INSERT violate the unique
// _jackson_store_key constraint (intermittent 500s / e2e flakes).
let jacksonPromise: Promise<void> | null = null;

export default async function init() {
  if (
    !g.apiController ||
    !g.oauthController ||
    !g.directorySync ||
    !g.spConfig
  ) {
    if (!jacksonPromise) {
      jacksonPromise = (async () => {
        const ret = await jackson(opts);

        apiController = ret.apiController;
        oauthController = ret.oauthController;
        directorySync = ret.directorySyncController;
        spConfig = ret.spConfig;

        g.apiController = apiController;
        g.oauthController = oauthController;
        g.directorySync = directorySync;
        g.spConfig = spConfig;
      })();
      // Self-reset on failure so a rejected init can be retried later.
      jacksonPromise = jacksonPromise.catch((err) => {
        jacksonPromise = null;
        throw err;
      });
    }

    await jacksonPromise;
  } else {
    apiController = g.apiController;
    oauthController = g.oauthController;
    directorySync = g.directorySync;
    spConfig = g.spConfig;
  }

  return {
    apiController,
    oauthController,
    directorySync,
    spConfig,
  };
}
