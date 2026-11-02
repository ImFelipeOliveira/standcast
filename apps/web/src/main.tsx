import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api/queries';
import { applyLang, getLang } from './i18n';
import { createAppRouter } from './router';
import './styles.css';
import { applyTheme, initialTheme, readStoredTheme } from './theme';

applyTheme(
  initialTheme(readStoredTheme(), window.matchMedia('(prefers-color-scheme: dark)').matches),
);
applyLang(getLang());

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
