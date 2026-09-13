import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Button } from 'react-daisyui';
import toast from 'react-hot-toast';
import {
  CalendarDaysIcon,
  ClockIcon,
  NoSymbolIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline';
import { ConfirmationDialog } from '@/components/shared';
import Modal from '@/components/shared/Modal';
import { defaultHeaders } from '@/lib/common';

interface AdminSubscriptionActionsProps {
  tenantId: string;
  tenantName: string;
  currentStatus?: string;
  currentEndDate?: string | null;
  onSuccess?: () => void;
}

export const AdminSubscriptionActions: React.FC<
  AdminSubscriptionActionsProps
> = ({
  tenantId,
  tenantName,
  currentStatus,
  currentEndDate,
  onSuccess,
}) => {
  const { t } = useTranslation('common');

  // Modal states
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [newEndDate, setNewEndDate] = useState(
    currentEndDate ? new Date(currentEndDate).toISOString().split('T')[0] : ''
  );
  const [newTrialEndDate, setNewTrialEndDate] = useState('');
  const [packageId, setPackageId] = useState('');
  const [addStartDate, setAddStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [addEndDate, setAddEndDate] = useState('');
  const [isTrialCheck, setIsTrialCheck] = useState(false);

  // Loading state
  const [loading, setLoading] = useState(false);

  const handleExtend = async () => {
    if (!newEndDate) {
      toast.error(t('admin-subs-enter-valid-date'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${tenantId}/extend`, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({ newEndDate: new Date(newEndDate).toISOString() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || t('admin-subs-action-failed'));
      }

      toast.success(t('admin-subs-extend-success'));
      setShowExtendModal(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || t('admin-subs-action-failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleTrialOverride = async () => {
    if (!newTrialEndDate) {
      toast.error(t('admin-subs-enter-valid-date'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/subscriptions/${tenantId}/trial-override`,
        {
          method: 'POST',
          headers: defaultHeaders,
          body: JSON.stringify({
            newTrialEndDate: new Date(newTrialEndDate).toISOString(),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || t('admin-subs-action-failed'));
      }

      toast.success(t('admin-subs-trial-success'));
      setShowTrialModal(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || t('admin-subs-action-failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${tenantId}/cancel`, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({ reason: 'Admin manual cancellation' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || t('admin-subs-action-failed'));
      }

      toast.success(t('admin-subs-cancel-success'));
      setShowCancelDialog(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || t('admin-subs-action-failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!packageId) {
      toast.error(t('admin-subs-select-package'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${tenantId}`, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({
          packageId,
          startDate: addStartDate ? new Date(addStartDate).toISOString() : undefined,
          endDate: addEndDate ? new Date(addEndDate).toISOString() : undefined,
          isTrial: isTrialCheck,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || t('admin-subs-action-failed'));
      }

      toast.success(t('admin-subs-create-success'));
      setShowAddModal(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || t('admin-subs-action-failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Extend Button */}
      <button
        type="button"
        title={t('admin-subs-extend-btn')}
        onClick={() => setShowExtendModal(true)}
        className="btn btn-xs btn-outline btn-primary gap-1"
        disabled={loading}
      >
        <CalendarDaysIcon className="h-3.5 w-3.5" />
        <span>{t('admin-subs-extend-short')}</span>
      </button>

      {/* Trial Override Button */}
      <button
        type="button"
        title={t('admin-subs-trial-btn')}
        onClick={() => setShowTrialModal(true)}
        className="btn btn-xs btn-outline btn-warning gap-1"
        disabled={loading}
      >
        <ClockIcon className="h-3.5 w-3.5" />
        <span>{t('admin-subs-trial-short')}</span>
      </button>

      {/* Cancel Button */}
      {currentStatus !== 'Cancelled' && (
        <button
          type="button"
          title={t('admin-subs-cancel-btn')}
          onClick={() => setShowCancelDialog(true)}
          className="btn btn-xs btn-outline btn-error gap-1"
          disabled={loading}
        >
          <NoSymbolIcon className="h-3.5 w-3.5" />
          <span>{t('admin-subs-cancel-short')}</span>
        </button>
      )}

      {/* Add Subscription Button */}
      <button
        type="button"
        title={t('admin-subs-add-btn')}
        onClick={() => setShowAddModal(true)}
        className="btn btn-xs btn-ghost text-gray-500 hover:text-primary gap-1"
        disabled={loading}
      >
        <PlusCircleIcon className="h-3.5 w-3.5" />
        <span>{t('admin-subs-add-short')}</span>
      </button>

      {/* Extend Modal */}
      <Modal open={showExtendModal} close={() => setShowExtendModal(false)}>
        <Modal.Header>
          {t('admin-subs-extend-title')} — {tenantName}
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('admin-subs-extend-desc')}
          </p>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold">
                {t('admin-subs-new-end-date')}
              </span>
            </label>
            <input
              type="date"
              className="input input-bordered w-full"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowExtendModal(false)}
            disabled={loading}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            color="primary"
            onClick={handleExtend}
            disabled={loading}
          >
            {loading ? t('saving') : t('save')}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Trial Override Modal */}
      <Modal open={showTrialModal} close={() => setShowTrialModal(false)}>
        <Modal.Header>
          {t('admin-subs-trial-title')} — {tenantName}
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('admin-subs-trial-desc')}
          </p>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold">
                {t('admin-subs-new-trial-date')}
              </span>
            </label>
            <input
              type="date"
              className="input input-bordered w-full"
              value={newTrialEndDate}
              onChange={(e) => setNewTrialEndDate(e.target.value)}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowTrialModal(false)}
            disabled={loading}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            color="warning"
            onClick={handleTrialOverride}
            disabled={loading}
          >
            {loading ? t('saving') : t('apply')}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Cancel Confirmation Dialog */}
      <ConfirmationDialog
        title={`${t('admin-subs-cancel-title')} — ${tenantName}`}
        visible={showCancelDialog}
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
        confirmText={t('admin-subs-confirm-cancel')}
        confirmColor="error"
        loading={loading}
      >
        <p>{t('admin-subs-cancel-warning')}</p>
      </ConfirmationDialog>

      {/* Add Subscription Modal */}
      <Modal open={showAddModal} close={() => setShowAddModal(false)}>
        <Modal.Header>
          {t('admin-subs-add-title')} — {tenantName}
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold">
                {t('admin-subs-package-id')}
              </span>
            </label>
            <input
              type="text"
              placeholder="e.g. 00000000-0000-0000-0000-000000000000"
              className="input input-bordered w-full font-mono text-sm"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">
                  {t('admin-subs-start-date')}
                </span>
              </label>
              <input
                type="date"
                className="input input-bordered w-full"
                value={addStartDate}
                onChange={(e) => setAddStartDate(e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">
                  {t('admin-subs-end-date')}
                </span>
              </label>
              <input
                type="date"
                className="input input-bordered w-full"
                value={addEndDate}
                onChange={(e) => setAddEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={isTrialCheck}
                onChange={(e) => setIsTrialCheck(e.target.checked)}
              />
              <span className="label-text font-semibold">
                {t('admin-subs-mark-as-trial')}
              </span>
            </label>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAddModal(false)}
            disabled={loading}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            color="primary"
            onClick={handleAdd}
            disabled={loading}
          >
            {loading ? t('saving') : t('create')}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AdminSubscriptionActions;
