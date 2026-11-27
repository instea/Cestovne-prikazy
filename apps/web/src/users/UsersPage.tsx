import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, apiDownload } from '../api/client';
import { sessionStore } from '../auth/session';
import { errorMessage } from '../i18n/format';
import { saveBlob } from '../ui/download';
import { Spinner } from '../ui/Spinner';
import { showSuccessToast } from '../ui/toast-store';
import { AnonymizeDialog } from './AnonymizeDialog';
import { DeactivateDialog } from './DeactivateDialog';
import { listName, USERS_KEY } from './users';

/** "Anonymized" (NFR-08) takes precedence over "Deactivated". */
function StatusBadge({ user }: { user: UserDto }) {
  const { t } = useTranslation();
  const label = user.anonymizedAt
    ? t('users.status.anonymized')
    : user.active
      ? t('users.status.active')
      : t('users.status.deactivated');
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}
    >
      {label}
    </span>
  );
}

interface RowActions {
  onDeactivate: (user: UserDto) => void;
  onAnonymize: (user: UserDto) => void;
  onExport: (user: UserDto) => void;
  /** Id of the user whose export is running. */
  exportingId: string | null;
}

function UsersTable({
  users,
  onDeactivate,
  onAnonymize,
  onExport,
  exportingId,
}: { users: UserDto[] } & RowActions) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2">{t('users.list.email')}</th>
            <th className="p-2">{t('users.list.name')}</th>
            <th className="p-2">{t('users.list.admin')}</th>
            <th className="p-2">{t('users.list.status')}</th>
            <th className="p-2">{t('users.list.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const name = listName(user) || user.email;
            const exporting = exportingId === user.id;
            return (
              <tr
                key={user.id}
                className={`border-b ${user.active ? '' : 'text-slate-400'}`}
              >
                <td className="p-2">{user.email}</td>
                <td className="p-2">{listName(user)}</td>
                <td className="p-2">
                  {user.isAdmin ? t('common.yes') : t('common.no')}
                </td>
                <td className="p-2">
                  <StatusBadge user={user} />
                </td>
                <td className="flex flex-wrap gap-3 p-2">
                  {/* NFR-08: anonymized users cannot be edited. */}
                  {!user.anonymizedAt && (
                    <Link
                      to={`/users/${encodeURIComponent(user.id)}/edit`}
                      aria-label={t('users.list.editUser', { name })}
                      className="text-blue-700 hover:underline"
                    >
                      {t('users.list.edit')}
                    </Link>
                  )}
                  {/* USR-04: every active user, incl. the current admin; no "Reactivate". */}
                  {user.active && (
                    <button
                      type="button"
                      aria-label={t('users.list.deactivateUser', { name })}
                      className="text-red-700 hover:underline"
                      onClick={() => onDeactivate(user)}
                    >
                      {t('users.list.deactivate')}
                    </button>
                  )}
                  {/* NFR-07: every user, incl. deactivated / anonymized. */}
                  <button
                    type="button"
                    aria-label={
                      exporting
                        ? undefined
                        : t('users.list.exportUser', { name })
                    }
                    className="text-blue-700 hover:underline disabled:cursor-wait disabled:text-slate-400 disabled:no-underline"
                    disabled={exporting}
                    onClick={() => onExport(user)}
                  >
                    {exporting
                      ? t('users.list.exporting')
                      : t('users.list.exportData')}
                  </button>
                  {/* NFR-08: every non-anonymized user, incl. the current admin. */}
                  {!user.anonymizedAt && (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={t('users.list.anonymizeUser', { name })}
                      className="text-red-700 hover:underline"
                      onClick={() => onAnonymize(user)}
                    >
                      {t('users.anonymize.action')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * USR-01 `/users` (admin only, guarded by the route). Order comes from the
 * API. Row actions: Edit (USR-02), Deactivate with confirmation (USR-04),
 * Export data (NFR-07), Anonymize with typed-email confirmation (NFR-08).
 */
export function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: USERS_KEY,
    queryFn: () => api<UserDto[]>('/users'),
  });
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<UserDto | null>(null);
  const [anonymizing, setAnonymizing] = useState<UserDto | null>(null);

  const deactivate = useMutation({
    mutationFn: (user: UserDto) =>
      api<UserDto>(`/users/${encodeURIComponent(user.id)}/deactivate`, {
        method: 'POST',
      }),
    // The dialog shows the error itself.
    meta: { inlineError: true },
    onSuccess: (updated) => {
      setConfirming(null);
      showSuccessToast(() => t('users.deactivate.success'));
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      // Self-deactivation: the own sessions are revoked; end this one now
      // (→ /login with the deactivated message, AUTH-05).
      if (updated.id === sessionStore.get().user?.id) {
        sessionStore.end(ErrorCode.USER_DEACTIVATED);
      }
    },
  });

  const anonymize = useMutation({
    mutationFn: ({
      user,
      confirmEmail,
    }: {
      user: UserDto;
      confirmEmail: string;
    }) =>
      api<UserDto>(`/admin/users/${encodeURIComponent(user.id)}/anonymize`, {
        method: 'POST',
        body: { confirmEmail },
      }),
    // The dialog shows the error itself.
    meta: { inlineError: true },
    onSuccess: (updated) => {
      setAnonymizing(null);
      showSuccessToast(() => t('users.anonymize.success'));
      // Self-anonymization: the own sessions are revoked and the cookie is
      // cleared by the server; end this session first and show /login
      // without a message. No refetch: it would go out with the revoked
      // token and come back as 401 USER_DEACTIVATED.
      if (updated.id === sessionStore.get().user?.id) {
        sessionStore.end();
        void navigate('/login', { replace: true });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
    },
  });

  const exportData = useMutation({
    mutationFn: async (user: UserDto) => {
      const { blob, fileName } = await apiDownload(
        `/admin/users/${encodeURIComponent(user.id)}/export`,
      );
      saveBlob(blob, fileName ?? `user-export-${user.id}.json`);
    },
    // Shown as an inline alert above the table.
    meta: { inlineError: true },
  });

  const cancelDialog = () => {
    setConfirming(null);
    deactivate.reset();
  };

  const cancelAnonymize = () => {
    setAnonymizing(null);
    anonymize.reset();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('users.list.title')}</h1>
      {users.isPending && <Spinner />}
      {users.isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded bg-red-100 p-3 text-red-700"
        >
          <span>
            {t('common.loadListError', { message: errorMessage(users.error) })}
          </span>
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50"
            disabled={users.isFetching}
            onClick={() => void users.refetch()}
          >
            {t('app.retry')}
          </button>
        </div>
      )}
      {exportData.isError && (
        <p role="alert" className="rounded bg-red-100 p-3 text-red-700">
          {errorMessage(exportData.error)}
        </p>
      )}
      {users.data && users.data.length === 0 && <p>{t('users.list.empty')}</p>}
      {users.data && users.data.length > 0 && (
        <UsersTable
          users={users.data}
          onDeactivate={(user) => {
            deactivate.reset();
            setConfirming(user);
          }}
          onAnonymize={(user) => {
            anonymize.reset();
            setAnonymizing(user);
          }}
          onExport={(user) => exportData.mutate(user)}
          exportingId={
            exportData.isPending ? (exportData.variables?.id ?? null) : null
          }
        />
      )}
      {confirming && (
        <DeactivateDialog
          user={confirming}
          pending={deactivate.isPending}
          error={deactivate.isError ? errorMessage(deactivate.error) : null}
          onConfirm={() => deactivate.mutate(confirming)}
          onCancel={cancelDialog}
        />
      )}
      {anonymizing && (
        <AnonymizeDialog
          user={anonymizing}
          isSelf={anonymizing.id === sessionStore.get().user?.id}
          pending={anonymize.isPending}
          error={anonymize.isError ? errorMessage(anonymize.error) : null}
          onConfirm={(confirmEmail) =>
            anonymize.mutate({ user: anonymizing, confirmEmail })
          }
          onCancel={cancelAnonymize}
        />
      )}
    </div>
  );
}
