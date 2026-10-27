import type { RouteObject } from 'react-router'

import { GuestOnly, RequireAuth } from '../auth/guards'
import { AppShell } from '../layouts/AppShell'
import { AuthLayout } from '../layouts/AuthLayout'
import { AccountPage } from '../pages/AccountPage'
import { NotFoundPage, RouteErrorPage } from '../pages/ErrorPages'
import { ExplorePage } from '../pages/ExplorePage'
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage'
import { LoginPage } from '../pages/auth/LoginPage'
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage'
import { SignupPage } from '../pages/auth/SignupPage'
import { VerifyEmailPage } from '../pages/auth/VerifyEmailPage'
import { WelcomePage } from '../pages/auth/WelcomePage'
import { FirstVisit } from '../pages/auth/firstVisit'
import { DirectionsPage, HazardsPage, MyReportsPage, NearbyPage, ReportPage } from '../pages/sections'

export const routes: RouteObject[] = [
  { path: 'welcome', element: <WelcomePage />, errorElement: <RouteErrorPage /> },
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'signup', element: <SignupPage /> },
        ],
      },
      { path: 'verify', element: <VerifyEmailPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <AppShell />,
    children: [
      {
        // Errors render inside the shell, so the header and navigation keep working.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <FirstVisit><ExplorePage /></FirstVisit> },
          { path: 'directions', element: <DirectionsPage /> },
          { path: 'hazards', element: <HazardsPage /> },
          { path: 'nearby', element: <NearbyPage /> },
          {
            element: <RequireAuth />,
            children: [
              { path: 'reports', element: <MyReportsPage /> },
              { path: 'report', element: <ReportPage /> },
              { path: 'account', element: <AccountPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
