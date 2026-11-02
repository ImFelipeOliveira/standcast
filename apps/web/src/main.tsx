import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getLang, setLang, useT } from './i18n';
import './styles.css';
import { applyTheme, initialTheme, readStoredTheme } from './theme';

applyTheme(
  initialTheme(readStoredTheme(), window.matchMedia('(prefers-color-scheme: dark)').matches),
);
setLang(getLang());

function App() {
  const t = useT();
  return (
    <main className="p-6">
      <h1 className="font-brand text-2xl text-ink">{t('app.name')}</h1>
      <p className="text-muted">{t('app.tagline')}</p>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
