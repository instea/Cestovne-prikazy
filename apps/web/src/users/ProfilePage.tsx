import type { UserDto } from '@leaves/shared/dto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { sessionStore } from '../auth/session';
import { errorMessage } from '../i18n/format';
import { Spinner } from '../ui/Spinner';
import { showSuccessToast } from '../ui/toast-store';
import {
  inputClass,
  type NameField,
  readOnlyClass,
  useNameMessage,
} from './user-form';
import { ME_KEY, USERS_KEY } from './users';

function ProfileForm({ user }: { user: UserDto }) {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const nameMessage = useNameMessage();
  const [values, setValues] = useState<Record<NameField, string>>({
    firstName: user.firstName,
    surname: user.surname,
  });

  const save = useMutation({
    mutationFn: (changes: Partial<Record<NameField, string>>) =>
      api<UserDto>('/users/me', { method: 'PATCH', body: changes }),
    // The form shows the error itself (red alert), no extra toast.
    meta: { inlineError: true },
    onSuccess: (updated) => {
      queryClient.setQueryData(ME_KEY, updated);
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      sessionStore.setUser(updated);
      setValues({ firstName: updated.firstName, surname: updated.surname });
      showSuccessToast(() => t('profile.saved'));
    },
  });

  // Only edited fields are validated and sent: an account may have an
  // empty stored name (DATA-01: Google gave none), which must not block
  // saving the other one. Clearing a non-empty name is still an error.
  const messages: Record<NameField, string | null> = {
    firstName: null,
    surname: null,
  };
  const changes: Partial<Record<NameField, string>> = {};
  for (const field of ['firstName', 'surname'] as const) {
    const value = values[field].trim();
    if (value === user[field]) continue;
    changes[field] = value;
    messages[field] = nameMessage(field, values[field]);
  }
  const invalid = messages.firstName !== null || messages.surname !== null;
  const unchanged = Object.keys(changes).length === 0;

  function nameInput(field: NameField) {
    const inputId = `${id}-${field}`;
    const message = messages[field];
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId}>{t(`profile.${field}`)}</label>
        <input
          id={inputId}
          className={inputClass}
          value={values[field]}
          aria-invalid={message !== null}
          aria-describedby={message ? `${inputId}-error` : undefined}
          onChange={(e) => setValues({ ...values, [field]: e.target.value })}
        />
        {message && (
          <span id={`${inputId}-error`} className="text-sm text-red-700">
            {message}
          </span>
        )}
      </div>
    );
  }

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
        <label htmlFor={`${id}-email`}>{t('profile.email')}</label>
        <input
          id={`${id}-email`}
          className={readOnlyClass}
          value={user.email}
          readOnly
        />
      </div>
      {nameInput('firstName')}
      {nameInput('surname')}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-admin`}>{t('profile.isAdmin')}</label>
        <input
          id={`${id}-admin`}
          className={readOnlyClass}
          value={user.isAdmin ? t('common.yes') : t('common.no')}
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
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1"
          disabled={save.isPending}
          onClick={() => {
            setValues({ firstName: user.firstName, surname: user.surname });
            save.reset();
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/** USR-03 `/profile`: any signed-in user edits their own names. */
export function ProfilePage() {
  const { t } = useTranslation();
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<UserDto>('/auth/me'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
      {me.isPending && <Spinner />}
      {me.isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded bg-red-100 p-3 text-red-700"
        >
          <span>{errorMessage(me.error)}</span>
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50"
            disabled={me.isFetching}
            onClick={() => void me.refetch()}
          >
            {t('app.retry')}
          </button>
        </div>
      )}
      {me.data && <ProfileForm user={me.data} />}
    </div>
  );
}
