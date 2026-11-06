import { Navigate, type RouteObject } from 'react-router';
import { AuditPage } from './audit/AuditPage';
import { RequireAdmin, RequireAuth } from './auth/guards';
import { Layout } from './layout/Layout';
import { LoginPage } from './pages/LoginPage';
import {
  ApprovalPage,
  EditUserPage,
  LeavesPage,
  NewLeavePage,
  ProfilePage,
  SummaryPage,
  UsersPage,
} from './pages/pages';
import { ErrorPage } from './ui/ErrorPage';

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
