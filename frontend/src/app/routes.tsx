import type { RouteObject } from 'react-router'

import { AppShell } from '../layouts/AppShell'
import { RouteErrorPage, NotFoundPage } from '../pages/ErrorPages'
import { ExplorePage } from '../pages/ExplorePage'
import {
  AccountPage, DirectionsPage, HazardsPage, MyReportsPage, NearbyPage, ReportPage,
} from '../pages/sections'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        // Errors render inside the shell, so the header and navigation keep working.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <ExplorePage /> },
          { path: 'directions', element: <DirectionsPage /> },
          { path: 'hazards', element: <HazardsPage /> },
          { path: 'nearby', element: <NearbyPage /> },
          { path: 'reports', element: <MyReportsPage /> },
          { path: 'report', element: <ReportPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
