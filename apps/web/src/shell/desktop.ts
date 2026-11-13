export const DESKTOP_QUERY = '(min-width: 900px)';

type DesktopMedia = {
  matches: boolean;
  addEventListener: (type: 'change', listener: (event: { matches: boolean }) => void) => void;
  removeEventListener: (type: 'change', listener: (event: { matches: boolean }) => void) => void;
};

export function watchDesktop(media: DesktopMedia, onDesktop: () => void): () => void {
  const listener = (event: { matches: boolean }) => {
    if (event.matches) onDesktop();
  };
  if (media.matches) onDesktop();
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
