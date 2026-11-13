import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { api } from '../api/client';
import { LOGOUT_REASON, sessionStore } from '../auth/session';
import { useSession } from '../auth/use-session';
import { LanguageSelect } from '../i18n/LanguageSelect';
import { clearUserData } from '../query-cache';
import { pendingLeavesQuery } from './pending-leaves';

function PendingBadge() {
  const { t } = useTranslation();
  const { data } = useQuery(pendingLeavesQuery);
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return (
    <span
      aria-label={t('nav.pendingCount', { count })}
      className="ml-1 rounded-full bg-red-600 px-2 text-xs text-white"
    >
      {count}
    </span>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-2 ${isActive ? 'bg-slate-700 text-white' : 'text-slate-200 hover:bg-slate-700'}`;

export function Layout() {
  const { t } = useTranslation();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isAdmin = user?.isAdmin === true;

  /**
   * AUTH-03: the local session ends first, so a slow or hanging request can
   * never keep the user on the page, and the epoch bump makes any in-flight
   * renewal stale (no `/login?returnTo`). RequireAuth then shows /login.
   * The request is cookie-identified (`/auth/logout` never renews) and its
   * outcome is ignored.
   */
  function logout() {
    setUserMenuOpen(false);
    sessionStore.end(LOGOUT_REASON);
    clearUserData(queryClient);
    void api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-slate-800 text-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
          <NavLink to="/leaves" className="mr-4 text-lg font-semibold">
            {t('app.name')}
          </NavLink>
          <button
            type="button"
            className="ml-auto rounded px-3 py-2 md:hidden"
            aria-label={t('nav.toggle')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {t('nav.menu')}
          </button>
          <div
            className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-1 md:flex md:w-auto md:flex-1 md:flex-row md:items-center`}
          >
            <NavLink to="/leaves" end className={linkClass}>
              {t('nav.leaves')}
            </NavLink>
            {isAdmin && (
              <>
                <NavLink to="/approval" className={linkClass}>
                  {t('nav.approval')}
                  <PendingBadge />
                </NavLink>
                <NavLink to="/users" className={linkClass}>
                  {t('nav.users')}
                </NavLink>
                <NavLink to="/audit" className={linkClass}>
                  {t('nav.audit')}
                </NavLink>
              </>
            )}
            <div className="relative md:ml-auto">
              <button
                type="button"
                className="rounded px-3 py-2 hover:bg-slate-700"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((o) => !o)}
              >
                {user ? `${user.firstName} ${user.surname}` : ''}
              </button>
              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-10 mt-1 w-48 rounded bg-white py-1 text-slate-800 shadow-lg"
                >
                  <NavLink
                    role="menuitem"
                    to="/profile"
                    className="block px-4 py-2 hover:bg-slate-100"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {t('nav.profile')}
                  </NavLink>
                  <NavLink
                    role="menuitem"
                    to="/summary"
                    className="block px-4 py-2 hover:bg-slate-100"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {t('nav.summary')}
                  </NavLink>
                  <LanguageSelect className="px-4 py-2" />
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-4 py-2 text-left hover:bg-slate-100"
                    onClick={logout}
                  >
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="py-4 text-center text-xs text-slate-500">
        {`v${__APP_VERSION__}`}
      </footer>
    </div>
  );
}
