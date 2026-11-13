import { useEffect, useState } from 'react';

export function nextScrolled(previous: boolean, y: number): boolean {
  if (y > 64) return true;
  if (y <= 2) return false;
  return previous;
}

export function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled((previous) => nextScrolled(previous, window.scrollY));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return scrolled;
}
