import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api/queries';
import { applyLang, getLang, watchBrowserLang } from './i18n';
import { createAppRouter } from './router';
import './styles.css';
import { applyTheme, initialTheme, PREFERS_DARK, readStoredTheme, watchSystemTheme } from './theme';

const systemTheme = window.matchMedia(PREFERS_DARK);
applyTheme(initialTheme(readStoredTheme(), systemTheme.matches));
watchSystemTheme(systemTheme);
applyLang(getLang());
watchBrowserLang(window);

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
