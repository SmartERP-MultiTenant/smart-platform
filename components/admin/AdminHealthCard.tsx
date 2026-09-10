import React from 'react';
import { Card } from '@/components/shared';
import { AdminHealthStatus } from 'models/adminDashboard';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

interface AdminHealthCardProps {
  health: AdminHealthStatus;
}

const AdminHealthCard = ({ health }: AdminHealthCardProps) => {
  const isHealthy = health.ok;
  const isReachable = health.reachable;

  return (
    <Card>
      <Card.Body>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {isHealthy ? (
              <div className="p-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-full">
                <CheckCircleIcon className="h-6 w-6" />
              </div>
            ) : isReachable ? (
              <div className="p-2 bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 rounded-full">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
            ) : (
              <div className="p-2 bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 rounded-full">
                <XCircleIcon className="h-6 w-6" />
              </div>
            )}
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                حالة نظام ERP
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    isHealthy
                      ? 'bg-emerald-500'
                      : isReachable
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`}
                />
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isHealthy
                  ? 'خادم ERP يعمل بشكل طبيعي والاتصال مستقر.'
                  : isReachable
                    ? 'خادم ERP متاح لكن واجه خطأ أثناء الاستجابة.'
                    : 'خادم ERP غير متاح حالياً (انقطاع الاتصال). تعمل المنصة بنمط التراجع الآمن.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {typeof health.latencyMs === 'number' && (
              <span className="font-mono">
                زمن الاستجابة: {health.latencyMs}ms
              </span>
            )}
            {health.statusCode && (
              <span className="font-mono">رمز الحالة: {health.statusCode}</span>
            )}
            {health.error && (
              <span className="text-rose-600 dark:text-rose-400 font-mono">
                الخطأ: {health.error}
              </span>
            )}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default AdminHealthCard;
