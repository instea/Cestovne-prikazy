import { Navigate, type RouteObject } from 'react-router';
import { ApprovalPage } from './approval/ApprovalPage';
import { AuditPage } from './audit/AuditPage';
import { RequireAdmin, RequireAuth } from './auth/guards';
import { Layout } from './layout/Layout';
import { LeavesPage } from './leaves/LeavesPage';
import { NewLeavePage } from './leaves/NewLeavePage';
import { LoginPage } from './pages/LoginPage';
import { SummaryPage } from './summary/SummaryPage';
import { ErrorPage } from './ui/ErrorPage';
import { EditUserPage } from './users/EditUserPage';
import { ProfilePage } from './users/ProfilePage';
import { UsersPage } from './users/UsersPage';

export const routes: RouteObject[] = [
  {
    errorElement: <ErrorPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <Layout />,
            children: [
              { path: '/', element: <Navigate to="/leaves" replace /> },
              { path: '/leaves', element: <LeavesPage /> },
              { path: '/leaves/new', element: <NewLeavePage /> },
              { path: '/summary', element: <SummaryPage /> },
              { path: '/profile', element: <ProfilePage /> },
              {
                element: <RequireAdmin />,
                children: [
                  { path: '/approval', element: <ApprovalPage /> },
                  { path: '/users', element: <UsersPage /> },
                  { path: '/users/:id/edit', element: <EditUserPage /> },
                  { path: '/audit', element: <AuditPage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/leaves" replace /> },
    ],
  },
];
