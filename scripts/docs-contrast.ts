type Rgb = [number, number, number];

export type CodeBackgrounds = { light: string; dark: string };

function toRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return fg.toUpperCase();
  const target: Rgb = luminance(bg) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  const start = toRgb(fg);
  for (let step = 1; step <= 100; step += 1) {
    const t = step / 100;
    const mixed = toHex(
      start.map((channel, i) => channel + ((target[i] ?? 0) - channel) * t) as Rgb,
    );
    if (contrast(mixed, bg) >= min) return mixed;
  }
  return toHex(target);
}

export function cssVariables(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const vars: Record<string, string> = {};
  for (const block of css.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const match of (block[1] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      vars[match[1] ?? ''] = (match[2] ?? '').trim();
    }
  }
  return vars;
}

export function codeBackgrounds(css: string): CodeBackgrounds {
  const light = cssVariables(css, ':root')['--vp-code-block-bg'];
  const dark = cssVariables(css, '.dark')['--vp-code-block-bg'];
  if (light === undefined || dark === undefined) {
    throw new Error('brand.css must set --vp-code-block-bg in :root and .dark');
  }
  return { light, dark };
}

export function fixShikiStyle(style: string, backgrounds: CodeBackgrounds, min = 4.5): string {
  return style.replace(
    /--shiki-(light|dark):(#[0-9A-Fa-f]{3,8})(?=;|$)/g,
    (whole, theme: 'light' | 'dark', color: string) => {
      const fixed = ensureContrast(color, backgrounds[theme], min);
      return fixed === color.toUpperCase() ? whole : `--shiki-${theme}:${fixed}`;
    },
  );
}

export function shikiContrastTransformer(backgrounds: CodeBackgrounds, min = 4.5) {
  return {
    name: 'standcast:contrast',
    span(node: { properties: Record<string, unknown> }) {
      const style = node.properties.style;
      if (typeof style === 'string') node.properties.style = fixShikiStyle(style, backgrounds, min);
    },
  };
}
