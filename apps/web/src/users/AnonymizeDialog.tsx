import type { UserDto } from '@leaves/shared/dto';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { anonymizeConfirmed } from './users';

/**
 * NFR-08 GDPR anonymization confirmation, on the shared `ConfirmDialog`
 * (focus trap, inert page, Esc / backdrop cancel when not pending).
 * "Anonymize" stays disabled until the admin types the user's email; while
 * the call runs it reads "Anonymizing…" and both buttons are disabled.
 * `error` (translated `errors.<code>`) shows as an inline alert.
 */
export function AnonymizeDialog({
  user,
  isSelf,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  user: UserDto;
  /** The admin's own row: an extra warning line. */
  isSelf: boolean;
  pending: boolean;
  error: string | null;
  /** Called with the typed text (the server compares it again). */
  onConfirm: (confirmEmail: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const confirmed = anonymizeConfirmed(typed, user.email);
  return (
    <ConfirmDialog
      title={t('users.anonymize.title')}
      confirmLabel={
        pending ? t('users.anonymize.submitting') : t('users.anonymize.action')
      }
      cancelLabel={t('common.cancel')}
      pending={pending}
      confirmDisabled={!confirmed}
      spinnerTestId="anonymize-spinner"
      onConfirm={() => {
        if (confirmed) onConfirm(typed);
      }}
      onCancel={onCancel}
      extra={
        <div className="space-y-3">
          {isSelf && (
            <p className="font-medium text-red-700">
              {t('users.anonymize.selfWarning')}
            </p>
          )}
          <div className="space-y-1">
            <label htmlFor={inputId} className="block text-sm font-medium">
              {t('users.anonymize.confirmLabel')}
            </label>
            <input
              id={inputId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
              value={typed}
              disabled={pending}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="rounded bg-red-100 p-2 text-red-700">
              {error}
            </p>
          )}
        </div>
      }
    >
      {t('users.anonymize.body', { email: user.email })}
    </ConfirmDialog>
  );
}
