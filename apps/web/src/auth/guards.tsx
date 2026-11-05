import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../ui/Spinner';
import { useSession } from './use-session';

/** All routes except /login. Boot refresh runs in <App>; here we wait for it. */
export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'unknown') return <FullPageSpinner />;
  if (status === 'anonymous') {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return <Outlet />;
}

/** UX only; the server enforces admin rights (NFR-01). */
export function RequireAdmin() {
  const { user } = useSession();
  return user?.isAdmin ? <Outlet /> : <Navigate to="/leaves" replace />;
}
