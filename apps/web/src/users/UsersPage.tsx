import type { UserDto } from '@leaves/shared/dto';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../api/client';
import { errorMessage } from '../i18n/format';
import { Spinner } from '../ui/Spinner';
import { listName, USERS_KEY } from './users';

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}
    >
      {active ? t('users.status.active') : t('users.status.deactivated')}
    </span>
  );
}

function UsersTable({ users }: { users: UserDto[] }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2">{t('users.list.email')}</th>
            <th className="p-2">{t('users.list.name')}</th>
            <th className="p-2">{t('users.list.admin')}</th>
            <th className="p-2">{t('users.list.status')}</th>
            <th className="p-2">{t('users.list.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className={`border-b ${user.active ? '' : 'text-slate-400'}`}
            >
              <td className="p-2">{user.email}</td>
              <td className="p-2">{listName(user)}</td>
              <td className="p-2">
                {user.isAdmin ? t('common.yes') : t('common.no')}
              </td>
              <td className="p-2">
                <StatusBadge active={user.active} />
              </td>
              <td className="flex gap-3 p-2">
                <Link
                  to={`/users/${encodeURIComponent(user.id)}/edit`}
                  aria-label={t('users.list.editUser', {
                    name: listName(user) || user.email,
                  })}
                  className="text-blue-700 hover:underline"
                >
                  {t('users.list.edit')}
                </Link>
                {/* TODO(USR-04): "Deactivate" (red, with confirmation) for every active user, incl. the current admin. */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** USR-01 `/users` (admin only, guarded by the route). Order comes from the API. */
export function UsersPage() {
  const { t } = useTranslation();
  const users = useQuery({
    queryKey: USERS_KEY,
    queryFn: () => api<UserDto[]>('/users'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('users.list.title')}</h1>
      {users.isPending && <Spinner />}
      {users.isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded bg-red-100 p-3 text-red-700"
        >
          <span>
            {t('common.loadListError', { message: errorMessage(users.error) })}
          </span>
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50"
            disabled={users.isFetching}
            onClick={() => void users.refetch()}
          >
            {t('app.retry')}
          </button>
        </div>
      )}
      {users.data && users.data.length === 0 && <p>{t('users.list.empty')}</p>}
      {users.data && users.data.length > 0 && <UsersTable users={users.data} />}
    </div>
  );
}
