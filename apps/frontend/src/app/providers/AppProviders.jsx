import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/shared/lib/queryClient';

export function AppProviders({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
