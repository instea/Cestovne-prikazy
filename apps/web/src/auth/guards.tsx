import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../ui/Spinner';
import { LOGOUT_REASON } from './session';
import { useSession } from './use-session';

/** All routes except /login. Boot refresh runs in <App>; here we wait for it. */
export function RequireAuth() {
  const { status, endReason } = useSession();
  const location = useLocation();
  if (status === 'unknown') return <FullPageSpinner />;
  if (status === 'anonymous' && endReason === LOGOUT_REASON) {
    return <Navigate to="/login" replace />;
  }
  if (status === 'anonymous') {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return <Outlet />;
}

/** Old "Unauthorized" page text (USR-01, NFR-06). */
export function Unauthorized() {
  const { t } = useTranslation();
  return (
    <p role="alert" className="rounded bg-red-100 p-3 text-red-700">
      {t('common.unauthorized')}
    </p>
  );
}

/**
 * UX only; the server enforces admin rights (NFR-01). A non-admin sees the
 * unauthorized text and the page makes no data request.
 */
export function RequireAdmin() {
  const { user } = useSession();
  return user?.isAdmin ? <Outlet /> : <Unauthorized />;
}
