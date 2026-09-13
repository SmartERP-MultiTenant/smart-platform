import { useState } from 'react';
import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { ApiResponse } from 'types';
import type { AdminRulesPayload } from '@/lib/adminRules';

export interface UpdatePlanModulesParams {
  planId: string;
  systemModuleIds: string[];
  syncExistingSubscriptions?: boolean;
}

const useAdminRules = () => {
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
        throw new Error(json.error?.message || 'فشل تحديث موديولات الباقة');
      }

      await mutate();
      return json;
    } catch (err: any) {
      setSaveError(err.message || 'حدث خطأ أثناء حفظ التعديلات');
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
          json.error?.message || 'فشلت مزامنة موديولات الاشتراكات'
        );
      }

      await mutate();
      return json;
    } catch (err: any) {
      setSaveError(err.message || 'حدث خطأ أثناء مزامنة الاشتراكات');
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
