import { USER_NAME_MAX_LENGTH, userNameError } from '@leaves/shared/users';
import { useTranslation } from 'react-i18next';

/** Shared by the USR-02 edit form and the USR-03 profile form. */
export type NameField = 'firstName' | 'surname';

export const inputClass =
  'rounded border border-slate-300 bg-white px-2 py-1 text-slate-800 aria-invalid:border-red-600';
export const readOnlyClass =
  'rounded border border-slate-200 bg-slate-100 px-2 py-1 text-slate-600';

/** Translated USR-02 / USR-03 message for an invalid name, or null. */
export function useNameMessage() {
  const { t } = useTranslation();
  return (field: NameField, value: string): string | null => {
    const error = userNameError(value);
    if (error === 'maxLength') {
      return t('validation.maxLength', { max: USER_NAME_MAX_LENGTH });
    }
    if (error === 'required') {
      return field === 'firstName'
        ? t('validation.firstNameRequired')
        : t('validation.surnameRequired');
    }
    return null;
  };
}
