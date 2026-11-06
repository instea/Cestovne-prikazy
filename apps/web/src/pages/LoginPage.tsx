import { ErrorCode } from '@leaves/shared/enums';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { safeReturnTo } from '../auth/return-to';
import { useSession } from '../auth/use-session';
import { LanguageSelect } from '../i18n/LanguageSelect';
import { FullPageSpinner } from '../ui/Spinner';

/** Shell of the sign-in screen; Google sign-in arrives with AUTH-01. */
export function LoginPage() {
  const { t } = useTranslation();
  const { status, endReason } = useSession();
  const [params] = useSearchParams();

  if (status === 'unknown') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return <Navigate to={safeReturnTo(params.get('returnTo'))} replace />;
  }
  return (
    <div className="mx-auto mt-8 max-w-sm space-y-4 text-center">
      <LanguageSelect className="justify-end" />
      <h1 className="mt-16 text-2xl font-semibold">{t('login.title')}</h1>
      {endReason === ErrorCode.USER_DEACTIVATED && (
        <p role="alert" className="rounded bg-red-100 p-3 text-red-700">
          {t('errors.USER_DEACTIVATED')}
        </p>
      )}
    </div>
  );
}
