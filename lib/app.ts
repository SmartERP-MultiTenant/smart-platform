import packageInfo from '../package.json';
import env from './env';

const app = {
  version: packageInfo.version,
  name: 'SMART PLATFORM',
  logoUrl: '/logo/logo-mark.png',
  url: env.appUrl,
};

export default app;
