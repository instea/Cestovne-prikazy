import type { LeaveDto } from '@leaves/shared/dto';
import { LeaveState } from '@leaves/shared/leaves';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useSession } from '../auth/use-session';
import { i18n } from '../i18n';
import { LEAVES_ROOT_KEY } from '../layout/query-keys';
import { showSuccessToast, showToast } from '../ui/toast-store';
import { decisionErrorKey } from './leave-decision';

export type LeaveDecision = 'approve' | 'reject';

/** The state a decision sets; its button is disabled on a leave already in it. */
const DECISION_STATE: Record<LeaveDecision, LeaveState> = {
  approve: LeaveState.APPROVED,
  reject: LeaveState.REJECTED,
};

const buttonBase =
  'flex items-center gap-2 rounded px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50';
const buttonClass: Record<LeaveDecision, string> = {
  approve: `${buttonBase} bg-green-700 hover:bg-green-800`,
  reject: `${buttonBase} bg-red-600 hover:bg-red-700`,
};

/**
 * APR-02 admin row actions on `/approval` and `/leaves`: "Approve" (green)
 * and "Reject" (red). Not rendered for non-admins (the server answers 403
 * anyway, APR-01). The button matching the current state is disabled; no
 * action returns a leave to PENDING. While this row's request runs (and the
 * leave queries refetch) both buttons are disabled and the clicked one shows
 * a spinner; every row has its own mutation, so other rows stay usable.
 * Success invalidates every leave query (list, pending list + badge,
 * summary). Errors get their own toast instead of the global one:
 * LEAVE_NOT_FOUND also refetches, so a leave deleted meanwhile disappears.
 */
export function LeaveDecisionButtons({ leave }: { leave: LeaveDto }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: (decision: LeaveDecision) =>
      api<LeaveDto>(`/leaves/${encodeURIComponent(leave.id)}/${decision}`, {
        method: 'POST',
      }),
    meta: { inlineError: true },
    onSuccess: async (_leave, decision) => {
      showSuccessToast(() =>
        i18n.t(
          decision === 'approve' ? 'approval.approved' : 'approval.rejected',
        ),
      );
      // Awaited: the buttons stay disabled until the row shows the result.
      await queryClient.invalidateQueries({ queryKey: LEAVES_ROOT_KEY });
    },
    onError: (error) => {
      const key = decisionErrorKey(error);
      showToast(() => i18n.t(key));
      if (key === 'approval.notFound') {
        void queryClient.invalidateQueries({ queryKey: LEAVES_ROOT_KEY });
      }
    },
  });

  if (user?.isAdmin !== true) return null;

  const button = (decision: LeaveDecision, label: string) => {
    const running = decide.isPending && decide.variables === decision;
    return (
      <button
        type="button"
        className={buttonClass[decision]}
        disabled={decide.isPending || leave.state === DECISION_STATE[decision]}
        aria-busy={running}
        onClick={() => decide.mutate(decision)}
      >
        {running && (
          <span
            aria-hidden="true"
            data-testid="decision-spinner"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        )}
        {label}
      </button>
    );
  };

  return (
    <>
      {button('approve', t('approval.approve'))}
      {button('reject', t('approval.reject'))}
    </>
  );
}
