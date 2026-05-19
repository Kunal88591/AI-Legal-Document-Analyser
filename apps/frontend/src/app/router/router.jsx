import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { RootLayout } from '@/app/layouts/RootLayout';
import Dashboard from '@/features/dashboard/Dashboard';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
    ],
  },
]);
