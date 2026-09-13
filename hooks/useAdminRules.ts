import { useState } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'next-i18next';
import fetcher from '@/lib/fetcher';
import { adminErrorCopy } from '@/lib/errors';
import type { ApiResponse } from 'types';
import type { AdminRulesPayload } from '@/lib/adminRules';

export interface UpdatePlanModulesParams {
  planId: string;
  systemModuleIds: string[];
  syncExistingSubscriptions?: boolean;
}

const useAdminRules = () => {
  // Fallback error copy is resolved through i18next rather than inlined as
  // Arabic literals, so an admin on the English locale never sees Arabic text.
  // (hooks/useTheme.ts uses the same useTranslation-inside-a-hook pattern.)
  const { t } = useTranslation('common');

  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<AdminRulesPayload>
  >('/api/admin/rules', fetcher, {
    revalidateOnFocus: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updatePlanModules = async ({
    planId,
    systemModuleIds,
    syncExistingSubscriptions = true,
  }: UpdatePlanModulesParams) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(
        `/api/admin/rules/plans/${encodeURIComponent(planId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemModuleIds,
            syncExistingSubscriptions,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(
          adminErrorCopy(json.error?.message, t, t('admin-rules-update-failed'))
        );
      }

      await mutate();
      return json;
    } catch (err: any) {
      setSaveError(err.message || t('admin-rules-save-error'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const syncAllModules = async (packageId?: string) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/admin/rules/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(
          adminErrorCopy(json.error?.message, t, t('admin-rules-sync-failed'))
        );
      }

      await mutate();
      return json;
    } catch (err: any) {
      setSaveError(err.message || t('admin-rules-sync-error'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    rules: data?.data,
    isLoading,
    isError: error,
    isSaving,
    saveError,
    setSaveError,
    mutate,
    updatePlanModules,
    syncAllModules,
  };
};

export default useAdminRules;
