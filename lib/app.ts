import packageInfo from '../package.json';
import env from './env';

const app = {
  version: packageInfo.version,
  name: 'SMART ERP',
  logoUrl: '/logo/logo-mark.png',
  url: env.appUrl,
};

export default app;
