import type { LeaveDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import { useSession } from '../auth/use-session';
import { currentLanguage } from '../i18n';
import { formatDate } from '../i18n/format';
import { LEAVES_ROOT_KEY } from '../layout/query-keys';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { showSuccessToast } from '../ui/toast-store';
import { formatUserRefLabel } from './leave-format';
import { canDeleteLeave } from './leave-permissions';

const dangerButton =
  'rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50';

function ConfirmDeleteDialog({
  leave,
  pending,
  onConfirm,
  onCancel,
}: {
  leave: LeaveDto;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  return (
    <ConfirmDialog
      role="alertdialog"
      title={t('leaves.delete.title')}
      confirmLabel={t('leaves.delete.confirm')}
      cancelLabel={t('common.cancel')}
      confirmFirst
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {t('leaves.delete.text', {
        requester: formatUserRefLabel(leave.requester, lang),
        start: formatDate(leave.startDate, lang),
        end: formatDate(leave.endDate, lang),
        type: t(`leaveType.${leave.type}`),
      })}
    </ConfirmDialog>
  );
}

/**
 * LV-03 row action on `/leaves`: "Delete" (danger) only where allowed,
 * confirmation dialog first. Success invalidates every leave query (list,
 * pending badge, summary) and toasts "Leave deleted"; an error is toasted
 * with the translated code by the global mutation handler, and a 404 also
 * refetches the list.
 */
export function DeleteLeaveAction({ leave }: { leave: LeaveDto }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () =>
      api<void>(`/leaves/${encodeURIComponent(leave.id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setConfirming(false);
      showSuccessToast(() => t('leaves.delete.deleted'));
      void queryClient.invalidateQueries({ queryKey: LEAVES_ROOT_KEY });
    },
    onError: (error) => {
      setConfirming(false);
      if (
        error instanceof ApiError &&
        error.code === ErrorCode.LEAVE_NOT_FOUND
      ) {
        void queryClient.invalidateQueries({ queryKey: LEAVES_ROOT_KEY });
      }
    },
  });

  if (!canDeleteLeave(leave, user)) return null;

  return (
    <>
      <button
        type="button"
        className={dangerButton}
        disabled={remove.isPending}
        onClick={() => setConfirming(true)}
      >
        {t('leaves.table.delete')}
      </button>
      {confirming && (
        <ConfirmDeleteDialog
          leave={leave}
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
