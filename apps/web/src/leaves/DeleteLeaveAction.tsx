import type { LeaveDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import { useSession } from '../auth/use-session';
import { currentLanguage } from '../i18n';
import { formatDate } from '../i18n/format';
import { LEAVES_ROOT_KEY } from '../layout/query-keys';
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
  const titleId = useId();
  const textId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Esc = Cancel (not while the request runs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, onCancel]);

  // Portal: a dialog must not live inside the table row.
  return createPortal(
    // Backdrop click = Cancel.
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      data-testid="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        className="w-full max-w-md space-y-4 rounded bg-white p-6 text-left shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {t('leaves.delete.title')}
        </h2>
        <p id={textId}>
          {t('leaves.delete.text', {
            requester: formatUserRefLabel(leave.requester, lang),
            start: formatDate(leave.startDate, lang),
            end: formatDate(leave.endDate, lang),
            type: t(`leaveType.${leave.type}`),
          })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={dangerButton}
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            {pending && (
              <span
                aria-hidden="true"
                className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/50 border-t-white align-middle"
              />
            )}
            {t('leaves.delete.confirm')}
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
