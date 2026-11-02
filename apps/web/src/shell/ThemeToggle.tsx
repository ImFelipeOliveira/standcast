import { Button } from '../components/ui/button';
import { useT } from '../i18n';
import { chooseTheme, useTheme } from '../theme';

export function ThemeToggle() {
  const t = useT();
  const theme = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? t('theme.light') : t('theme.dark');
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="ml-auto text-text2"
      aria-label={label}
      title={label}
      onClick={() => chooseTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </Button>
  );
}
