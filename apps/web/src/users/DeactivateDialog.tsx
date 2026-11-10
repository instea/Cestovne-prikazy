import type { UserDto } from '@leaves/shared/dto';
import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { fullName } from './users';

/**
 * USR-04 confirmation. Esc and a backdrop click cancel (not while the call
 * runs); during the call both buttons are disabled and "Deactivate" shows
 * a spinner. `error` (translated) keeps the dialog open with red text.
 */
export function DeactivateDialog({
  user,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  user: UserDto;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const bodyId = useId();
  const name = fullName(user);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        data-testid="dialog-backdrop"
        className="absolute inset-0 bg-slate-900/40"
        onClick={() => {
          if (!pending) onCancel();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-md space-y-4 rounded bg-white p-6 shadow-lg"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {t('users.deactivate.title')}
        </h2>
        <p id={bodyId}>
          {t('users.deactivate.body', {
            user: name ? `${name} (${user.email})` : user.email,
          })}
        </p>
        {error && <p className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
            disabled={pending}
            onClick={onCancel}
            autoFocus
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            {pending && (
              <span
                aria-hidden="true"
                data-testid="deactivate-spinner"
                className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-white"
              />
            )}
            {t('users.deactivate.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
