import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  CubeIcon,
  SparklesIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { Alert } from '@/components/shared';
import type { AdminRulesPayload } from '@/lib/adminRules';
import type { ErpPackageDetailed, ErpSystemModule } from '@/lib/erp';

interface AdminRulesMatrixProps {
  rules: AdminRulesPayload | undefined;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;
  onUpdatePlanModules: (params: {
    planId: string;
    systemModuleIds: string[];
    syncExistingSubscriptions: boolean;
  }) => Promise<any>;
  onSyncAllModules: (packageId?: string) => Promise<any>;
  onRefresh: () => void;
}

export const AdminRulesMatrix: React.FC<AdminRulesMatrixProps> = ({
  rules,
  isLoading,
  isSaving,
  saveError,
  onUpdatePlanModules,
  onSyncAllModules,
  onRefresh,
}) => {
  const { t } = useTranslation('common');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [syncExistingSubs, setSyncExistingSubs] = useState<boolean>(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activePlanEdits, setActivePlanEdits] = useState<
    Record<string, string[]>
  >({});
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Initialize or get enabled modules for a package
  const getEnabledModuleIds = (pkg: ErpPackageDetailed): string[] => {
    if (activePlanEdits[pkg.id]) {
      return activePlanEdits[pkg.id];
    }
    if (pkg.systemModules && Array.isArray(pkg.systemModules)) {
      return pkg.systemModules.map((sm) => sm.id);
    }
    return [];
  };

  const handleToggleModule = (
    pkg: ErpPackageDetailed,
    moduleId: string,
    systemModules: ErpSystemModule[]
  ) => {
    const currentEnabled = getEnabledModuleIds(pkg);
    const isCurrentlyEnabled = currentEnabled.includes(moduleId);

    const newEnabled = isCurrentlyEnabled
      ? currentEnabled.filter((id) => id !== moduleId)
      : [...currentEnabled, moduleId];

    setActivePlanEdits((prev) => ({
      ...prev,
      [pkg.id]: newEnabled,
    }));
  };

  const handleSelectAll = (
    pkg: ErpPackageDetailed,
    systemModules: ErpSystemModule[]
  ) => {
    const allActiveIds = systemModules
      .filter((m) => m.isActive !== false)
      .map((m) => m.id);
    setActivePlanEdits((prev) => ({
      ...prev,
      [pkg.id]: allActiveIds,
    }));
  };

  const handleDeselectAll = (pkg: ErpPackageDetailed) => {
    setActivePlanEdits((prev) => ({
      ...prev,
      [pkg.id]: [],
    }));
  };

  const handleSavePlan = async (pkg: ErpPackageDetailed) => {
    const enabledIds = getEnabledModuleIds(pkg);
    setSuccessMessage(null);

    try {
      await onUpdatePlanModules({
        planId: pkg.id,
        systemModuleIds: enabledIds,
        syncExistingSubscriptions: syncExistingSubs,
      });

      setSuccessMessage(
        `${t('admin-rules-save-success', 'تم حفظ وتحديث موديولات الباقة بنجاح')}: ${pkg.name}`
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch {
      // Error handled by parent hook saveError
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSuccessMessage(null);
    try {
      const res = await onSyncAllModules();
      setSuccessMessage(
        res?.result?.message ||
          t(
            'admin-rules-sync-success',
            'تمت مزامنة موديولات الاشتراكات للمشتركين القائمين بنجاح'
          )
      );
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch {
      // Handled by saveError
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (!rules) {
    return (
      <Alert status="error">
        {t(
          'admin-rules-load-error',
          'تعذر تحميل مصفوفة القواعد والموديولات — حاول مرة أخرى لاحقاً.'
        )}
      </Alert>
    );
  }

  const { packages = [], systemModules = [], ok, error } = rules;
  const activePackages = packages.filter((p) => p.isActive !== false);
  const currentPlan =
    packages.find((p) => p.id === selectedPlanId) || activePackages[0] || packages[0];

  return (
    <div className="space-y-6">
      {/* Degraded Alert Banner if ERP is degraded or error occurred */}
      {(!ok || error) && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-warning-content shadow-sm">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-warning" />
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {t(
                  'admin-rules-erp-alert-title',
                  'تنبيه حالة الاتصال بنظام الـ ERP'
                )}
              </h3>
              <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                {error ||
                  t(
                    'admin-rules-erp-alert-desc',
                    'تعذر مزامنة قواعد الباقات مباشرة مع الـ ERP.'
                  )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Global Success / Error notifications */}
      {successMessage && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-success-content flex items-center gap-3">
          <CheckCircleIcon className="h-5 w-5 text-success shrink-0" />
          <span className="text-sm font-semibold">{successMessage}</span>
        </div>
      )}

      {saveError && (
        <div className="rounded-xl border border-error/30 bg-error/10 p-4 text-error-content flex items-center gap-3">
          <ExclamationCircleIcon className="h-5 w-5 text-error shrink-0" />
          <span className="text-sm font-semibold">{saveError}</span>
        </div>
      )}

      {/* Top Header & Overview Cards */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AdjustmentsHorizontalIcon className="h-6 w-6 text-primary" />
            <span>
              {t(
                'admin-rules-title',
                'مصفوفة صلاحيات وقواعد الباقات (Plan Module Rules)'
              )}
            </span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t(
              'admin-rules-subtitle',
              'تحكم في الوحدات البرمجية المفعلة لكل باقة اشتراك ونشر الصلاحيات للمستأجرين المشتركين'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || isSaving}
            className="btn btn-sm btn-ghost gap-1.5 text-xs"
            title={t('refresh', 'تحديث')}
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
            <span>{t('refresh', 'تحديث')}</span>
          </button>

          <button
            type="button"
            onClick={handleSyncAll}
            disabled={isSaving || isSyncing || !ok}
            className="btn btn-sm btn-outline btn-primary gap-1.5 text-xs"
            title={t(
              'admin-rules-sync-all-btn-desc',
              'إعادة مزامنة موديولات جميع الاشتراكات القائمة'
            )}
          >
            <SparklesIcon
              className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span>
              {isSyncing
                ? t('admin-rules-syncing', 'جاري المزامنة...')
                : t(
                    'admin-rules-sync-all-btn',
                    'مزامنة جميع الاشتراكات الحالية'
                  )}
            </span>
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('admin-rules-stat-plans', 'إجمالي الباقات')}
            </p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {packages.length}
            </p>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <CubeIcon className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('admin-rules-stat-modules', 'الوحدات البرمجية في النظام')}
            </p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {systemModules.length}
            </p>
          </div>
          <div className="p-3 bg-secondary/10 rounded-xl text-secondary">
            <ShieldCheckIcon className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('admin-rules-stat-active-plans', 'الباقات النشطة للتسجيل')}
            </p>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
              {activePackages.length}
            </p>
          </div>
          <div className="p-3 bg-accent/10 rounded-xl text-accent">
            <CheckCircleIcon className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Plan Tabs Selection */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
              {packages.map((pkg) => {
                const isSelected = currentPlan?.id === pkg.id;
                const enabledCount = getEnabledModuleIds(pkg).length;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPlanId(pkg.id)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      isSelected
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span>{pkg.name}</span>
                    <span
                      className={`badge badge-sm ${
                        isSelected
                          ? 'bg-white/20 text-white border-none'
                          : 'badge-ghost'
                      }`}
                    >
                      {enabledCount} / {systemModules.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {currentPlan && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectAll(currentPlan, systemModules)}
                  disabled={isSaving}
                  className="btn btn-xs btn-ghost text-xs"
                >
                  {t('admin-rules-select-all', 'تفعيل الكل')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeselectAll(currentPlan)}
                  disabled={isSaving}
                  className="btn btn-xs btn-ghost text-xs text-error"
                >
                  {t('admin-rules-deselect-all', 'تعطيل الكل')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Selected Plan Details & Module Toggles Matrix */}
        {currentPlan ? (
          <div className="p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {currentPlan.name}
                  </h3>
                  {currentPlan.isActive ? (
                    <span className="badge badge-success badge-sm font-semibold">
                      {t('active', 'نشطة')}
                    </span>
                  ) : (
                    <span className="badge badge-ghost badge-sm">
                      {t('inactive', 'غير نشطة')}
                    </span>
                  )}
                </div>
                {currentPlan.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {currentPlan.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-6 text-xs text-gray-600 dark:text-gray-300">
                <div>
                  <span className="text-gray-400 block font-normal">
                    {t('admin-revenue-col-price', 'السعر الشهري')}:
                  </span>
                  <span className="font-bold text-sm text-gray-900 dark:text-white">
                    {currentPlan.priceMonthly ?? 0} {t('admin-revenue-sar', 'ر.س')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block font-normal">
                    {t('admin-subs-trial-days', 'الأيام التجريبية')}:
                  </span>
                  <span className="font-bold text-sm text-gray-900 dark:text-white">
                    {currentPlan.trialDays ?? 0} {t('days', 'يوم')}
                  </span>
                </div>
              </div>
            </div>

            {/* Modules Grid */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {t(
                  'admin-rules-modules-heading',
                  'الوحدات البرمجية المتاحة في هذه الباقة'
                )}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {systemModules.map((module) => {
                  const enabledIds = getEnabledModuleIds(currentPlan);
                  const isEnabled = enabledIds.includes(module.id);

                  return (
                    <div
                      key={module.id}
                      className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                        isEnabled
                          ? 'border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-xs'
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 opacity-75'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              isEnabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          />
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                            {module.name}
                          </p>
                        </div>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          {module.code}
                        </p>
                        {module.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                            {module.description}
                          </p>
                        )}
                      </div>

                      {/* Accessible Toggle Switch with Text Labels */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <input
                          type="checkbox"
                          id={`toggle-${currentPlan.id}-${module.id}`}
                          aria-label={`${module.name} - ${isEnabled ? t('enabled', 'مفعل') : t('disabled', 'معطل')}`}
                          checked={isEnabled}
                          disabled={isSaving}
                          onChange={() =>
                            handleToggleModule(currentPlan, module.id, systemModules)
                          }
                          className="toggle toggle-primary toggle-sm"
                        />
                        <label
                          htmlFor={`toggle-${currentPlan.id}-${module.id}`}
                          className={`text-[11px] font-semibold select-none cursor-pointer ${
                            isEnabled
                              ? 'text-primary'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {isEnabled
                            ? t('enabled', 'مفعل')
                            : t('disabled', 'معطل')}
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={syncExistingSubs}
                  onChange={(e) => setSyncExistingSubs(e.target.checked)}
                  className="checkbox checkbox-primary checkbox-xs"
                />
                <span className="font-medium">
                  {t(
                    'admin-rules-sync-checkbox',
                    'تطبيق التعديل فوراً على جميع اشتراكات الشركات الحالية المشتركة في هذه الباقة'
                  )}
                </span>
              </label>

              <button
                type="button"
                onClick={() => handleSavePlan(currentPlan)}
                disabled={isSaving || !ok}
                className="btn btn-primary text-white btn-sm px-6 gap-2"
              >
                {isSaving ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    <span>{t('saving', 'جاري الحفظ...')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-4 w-4" />
                    <span>
                      {t('admin-rules-save-btn', 'حفظ تغييرات الباقة')}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            {t('admin-rules-no-plans', 'لا توجد باقات متاحة حالياً.')}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminRulesMatrix;
