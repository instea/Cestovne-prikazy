import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import { sessionStore } from '../auth/session';
import { errorMessage } from '../i18n/format';
import { LoadError } from '../ui/LoadError';
import { Spinner } from '../ui/Spinner';
import { showSuccessToast } from '../ui/toast-store';
import {
  inputClass,
  type NameField,
  readOnlyClass,
  useNameMessage,
} from './user-form';
import { ME_KEY, USERS_KEY, userKey } from './users';

interface Changes {
  firstName?: string;
  surname?: string;
  isAdmin?: boolean;
}

function EditUserForm({ user }: { user: UserDto }) {
  const { t } = useTranslation();
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nameMessage = useNameMessage();
  const [names, setNames] = useState<Record<NameField, string>>({
    firstName: user.firstName,
    surname: user.surname,
  });
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);

  const save = useMutation({
    mutationFn: (changes: Changes) =>
      api<UserDto>(`/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        body: changes,
      }),
    // The form shows the error itself (red alert), no extra toast.
    meta: { inlineError: true },
    onSuccess: async (updated) => {
      queryClient.setQueryData(userKey(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      showSuccessToast(() => t('users.edit.saved'));
      if (updated.id !== sessionStore.get().user?.id) {
        await navigate('/users');
        return;
      }
      // The admin edited themselves: reload the session user, so the header
      // and admin menus follow (a self-demotion removes them).
      let me = updated;
      try {
        me = await api<UserDto>('/auth/me');
      } catch {
        // keep the PATCH result
      }
      queryClient.setQueryData(ME_KEY, me);
      await navigate(me.isAdmin ? '/users' : '/leaves');
      sessionStore.setUser(me);
    },
  });

  // As on /profile: only edited names are validated and sent, so a stored
  // empty name (DATA-01: Google gave none) does not block other changes.
  const messages: Record<NameField, string | null> = {
    firstName: null,
    surname: null,
  };
  const changes: Changes = {};
  for (const field of ['firstName', 'surname'] as const) {
    const value = names[field].trim();
    if (value === user[field]) continue;
    changes[field] = value;
    messages[field] = nameMessage(field, names[field]);
  }
  if (isAdmin !== user.isAdmin) changes.isAdmin = isAdmin;
  const invalid = messages.firstName !== null || messages.surname !== null;
  const unchanged = Object.keys(changes).length === 0;

  function nameInput(field: NameField) {
    const inputId = `${id}-${field}`;
    const message = messages[field];
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId}>{t(`users.edit.${field}`)}</label>
        <input
          id={inputId}
          className={inputClass}
          value={names[field]}
          aria-invalid={message !== null}
          aria-describedby={message ? `${inputId}-error` : undefined}
          onChange={(e) => setNames({ ...names, [field]: e.target.value })}
        />
        {message && (
          <span id={`${inputId}-error`} className="text-sm text-red-700">
            {message}
          </span>
        )}
      </div>
    );
  }

  const status = user.anonymizedAt
    ? t('users.status.anonymized')
    : user.active
      ? t('users.status.active')
      : t('users.status.deactivated');

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid || unchanged || save.isPending) return;
        save.mutate(changes);
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-email`}>{t('users.edit.email')}</label>
        <input
          id={`${id}-email`}
          className={readOnlyClass}
          value={user.email}
          readOnly
        />
      </div>
      {nameInput('firstName')}
      {nameInput('surname')}
      <div className="flex items-center gap-2">
        <input
          id={`${id}-admin`}
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
        />
        <label htmlFor={`${id}-admin`}>{t('users.edit.isAdmin')}</label>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-status`}>{t('users.edit.status')}</label>
        <input
          id={`${id}-status`}
          className={readOnlyClass}
          value={status}
          readOnly
        />
      </div>
      {save.isError && (
        <p role="alert" className="rounded bg-red-100 p-3 text-red-700">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded bg-slate-800 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={invalid || unchanged || save.isPending}
        >
          {t('common.save')}
        </button>
        <Link
          to="/users"
          className="rounded border border-slate-300 px-3 py-1"
          aria-disabled={save.isPending}
        >
          {t('common.cancel')}
        </Link>
      </div>
    </form>
  );
}

/** USR-02 `/users/:id/edit` (admin only, guarded by the route). */
export function EditUserPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const user = useQuery({
    queryKey: userKey(id),
    queryFn: () => api<UserDto>(`/users/${encodeURIComponent(id)}`),
  });
  const notFound =
    user.error instanceof ApiError &&
    user.error.code === ErrorCode.USER_NOT_FOUND;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('users.edit.title')}</h1>
      {user.isPending && <Spinner />}
      {notFound && (
        <div className="space-y-2">
          <p role="alert">{t('errors.USER_NOT_FOUND')}</p>
          <Link to="/users" className="text-blue-700 hover:underline">
            {t('users.edit.backToUsers')}
          </Link>
        </div>
      )}
      {user.isError && !notFound && (
        <LoadError
          message={t('users.edit.loadError', {
            message: errorMessage(user.error),
          })}
          retrying={user.isFetching}
          onRetry={() => void user.refetch()}
        />
      )}
      {/* Keyed: a refetched user resets the form to the stored values. */}
      {user.data && <EditUserForm key={user.data.updatedAt} user={user.data} />}
    </div>
  );
}
