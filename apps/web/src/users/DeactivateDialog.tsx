import type { UserDto } from '@leaves/shared/dto';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { fullName } from './users';

/**
 * USR-04 confirmation. Esc and a backdrop click cancel (not while the call
 * runs); during the call both buttons are disabled and "Deactivate" shows
 * a spinner. `error` (translated) keeps the dialog open with red text.
 * Focus stays inside the dialog and returns to the trigger on close.
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
  const name = fullName(user);
  return (
    <ConfirmDialog
      title={t('users.deactivate.title')}
      error={error}
      confirmLabel={t('users.deactivate.confirm')}
      cancelLabel={t('common.cancel')}
      pending={pending}
      spinnerTestId="deactivate-spinner"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {t('users.deactivate.body', {
        user: name ? `${name} (${user.email})` : user.email,
      })}
    </ConfirmDialog>
  );
}
