import { ErpPackageDetailed, ErpSystemModule } from './erp';

export interface AdminRulesPayload {
  ok: boolean;
  packages: ErpPackageDetailed[];
  systemModules: ErpSystemModule[];
  error?: string;
}

export function createDegradedRulesPayload(error: string): AdminRulesPayload {
  return {
    ok: false,
    packages: [],
    systemModules: [],
    error,
  };
}
