import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';

const PT_TO_PX = 4 / 3;

type Side = { width: number; color: string };

type Shadow = { color: string; dx: number; dy: number; blur: number; spread: number };

type Box = {
  kind: 'box';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string | null;
  radii: [number, number, number, number];
  sides: [Side, Side, Side, Side];
  shadows: Shadow[];
};

type InlineSvg = {
  kind: 'svg';
  x: number;
  y: number;
  w: number;
  h: number;
  viewBox: string;
  inner: string;
};

type Layer = Box | InlineSvg;

export type Artboard = { file: string; width: number; height: number; label: string };

const HIDE_ALL_BUT_TEXT = `
*{background:transparent!important;box-shadow:none!important;border-color:transparent!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
svg{visibility:hidden!important}
@page{margin:0}
`;

function round(value: number): string {
  const fixed = value.toFixed(2);
  return fixed.replace(/\.?0+$/, '') || '0';
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function parseColor(css: string): { hex: string; alpha: number } | null {
  const match = css.match(/rgba?\(([^)]+)\)/);
  if (match === null) return null;
  const parts = (match[1] ?? '')
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  if (a === 0) return null;
  const hex = [r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return { hex: `#${hex}`, alpha: Math.round(a * 1000) / 1000 };
}

function paint(attribute: 'fill' | 'stroke', css: string): string {
  const color = parseColor(css);
  if (color === null) return `${attribute}="none"`;
  const opacity = color.alpha < 1 ? ` ${attribute}-opacity="${color.alpha}"` : '';
  return `${attribute}="${color.hex}"${opacity}`;
}

export function parseShadows(css: string): Shadow[] {
  if (css === 'none' || css === '') return [];
  return css.split(/,(?![^(]*\))/).map((part) => {
    const color = part.match(/rgba?\([^)]+\)/)?.[0] ?? 'rgba(0, 0, 0, 0)';
    const [dx = 0, dy = 0, blur = 0, spread = 0] = part
      .replace(color, '')
      .trim()
      .split(/\s+/)
      .map((value) => Number.parseFloat(value));
    return { color, dx, dy, blur, spread };
  });
}

function roundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  radii: [number, number, number, number],
  attributes: string,
): string {
  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((radius) => Math.max(0, Math.min(radius, limit))) as [
    number,
    number,
    number,
    number,
  ];
  if (tl === tr && tr === br && br === bl) {
    const rx = tl > 0 ? ` rx="${round(tl)}"` : '';
    return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}"${rx} ${attributes}/>`;
  }
  const d = [
    `M${round(x + tl)} ${round(y)}`,
    `H${round(x + w - tr)}`,
    tr > 0 ? `A${round(tr)} ${round(tr)} 0 0 1 ${round(x + w)} ${round(y + tr)}` : '',
    `V${round(y + h - br)}`,
    br > 0 ? `A${round(br)} ${round(br)} 0 0 1 ${round(x + w - br)} ${round(y + h)}` : '',
    `H${round(x + bl)}`,
    bl > 0 ? `A${round(bl)} ${round(bl)} 0 0 1 ${round(x)} ${round(y + h - bl)}` : '',
    `V${round(y + tl)}`,
    tl > 0 ? `A${round(tl)} ${round(tl)} 0 0 1 ${round(x + tl)} ${round(y)}` : '',
    'Z',
  ].join('');
  return `<path d="${d}" ${attributes}/>`;
}

function renderBox(box: Box, filters: Map<number, string>): string {
  const out: string[] = [];
  for (const shadow of box.shadows) {
    const sigma = shadow.blur / 2;
    const id = `blur${round(sigma).replace('.', '_')}`;
    filters.set(
      sigma,
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${round(sigma)}"/></filter>`,
    );
    const radii = box.radii.map((radius) => Math.max(0, radius + shadow.spread)) as Box['radii'];
    out.push(
      roundedRect(
        box.x + shadow.dx - shadow.spread,
        box.y + shadow.dy - shadow.spread,
        box.w + shadow.spread * 2,
        box.h + shadow.spread * 2,
        radii,
        `${paint('fill', shadow.color)}${sigma > 0 ? ` filter="url(#${id})"` : ''}`,
      ),
    );
  }
  if (box.fill !== null) {
    out.push(roundedRect(box.x, box.y, box.w, box.h, box.radii, paint('fill', box.fill)));
  }
  const [top, right, bottom, left] = box.sides;
  const uniform =
    top.width > 0 &&
    [right, bottom, left].every((side) => side.width === top.width && side.color === top.color);
  if (uniform) {
    const inset = top.width / 2;
    const radii = box.radii.map((radius) => Math.max(0, radius - inset)) as Box['radii'];
    out.push(
      roundedRect(
        box.x + inset,
        box.y + inset,
        box.w - top.width,
        box.h - top.width,
        radii,
        `fill="none" ${paint('stroke', top.color)} stroke-width="${round(top.width)}"`,
      ),
    );
  } else {
    const strips: [Side, number, number, number, number][] = [
      [top, box.x, box.y, box.w, top.width],
      [right, box.x + box.w - right.width, box.y, right.width, box.h],
      [bottom, box.x, box.y + box.h - bottom.width, box.w, bottom.width],
      [left, box.x, box.y, left.width, box.h],
    ];
    for (const [side, x, y, w, h] of strips) {
      if (side.width > 0)
        out.push(roundedRect(x, y, w, h, [0, 0, 0, 0], paint('fill', side.color)));
    }
  }
  return out.join('');
}

function renderInlineSvg(svg: InlineSvg): string {
  return `<svg x="${round(svg.x)}" y="${round(svg.y)}" width="${round(svg.w)}" height="${round(svg.h)}" viewBox="${svg.viewBox}">${svg.inner}</svg>`;
}

function scalePath(d: string, dx: number, dy: number): string {
  let axis = 0;
  return d.replace(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g, (token) => {
    if (/^[A-Za-z]$/.test(token)) {
      axis = 0;
      return token;
    }
    const offset = axis % 2 === 0 ? dx : dy;
    axis += 1;
    return round((Number(token) + offset) * PT_TO_PX);
  });
}

export function textLayerFromCairoSvg(svg: string): { defs: string; body: string } {
  const [defsPart = '', bodyPart = ''] = svg.split('</defs>');
  const glyphs = new Map<string, string>();
  for (const match of defsPart.matchAll(/<g id="(glyph-[\d-]+)">([\s\S]*?)<\/g>/g)) {
    const paths = [...(match[2] ?? '').matchAll(/<path[^>]*\sd="([^"]*)"/g)].map((p) => p[1]);
    const d = paths.join(' ').replace(/\s+/g, ' ').trim();
    if (d !== '') glyphs.set(match[1] ?? '', d);
  }
  const ids = new Map<string, string>();
  const defs: string[] = [];
  const groups: { fill: string; uses: string[] }[] = [];
  for (const group of bodyPart.matchAll(
    /<g ((?:[^>]*\s)?(?:fill="|style="[^"]*\bfill:)[^>]*)>([\s\S]*?)<\/g>/g,
  )) {
    const paintSpec = groupPaint(group[1] ?? '');
    if (paintSpec === null) continue;
    const fill = cairoColor(paintSpec.color, paintSpec.opacity);
    for (const use of (group[2] ?? '').matchAll(
      /<use xlink:href="#([^"]+)" x="([^"]+)" y="([^"]+)"\/>/g,
    )) {
      const glyph = use[1] ?? '';
      const d = glyphs.get(glyph);
      if (d === undefined) continue;
      let id = ids.get(glyph);
      if (id === undefined) {
        id = `g${ids.size + 1}`;
        ids.set(glyph, id);
        defs.push(`<path id="${id}" d="${scalePath(d, 0, 0)}"/>`);
      }
      const x = round(Number(use[2]) * PT_TO_PX);
      const y = round(Number(use[3]) * PT_TO_PX);
      const last = groups.at(-1);
      const tag = `<use href="#${id}" x="${x}" y="${y}"/>`;
      if (last !== undefined && last.fill === fill) last.uses.push(tag);
      else groups.push({ fill, uses: [tag] });
    }
  }
  if (groups.length === 0) {
    throw new Error('pdftocairo output has no text layer: no glyph groups were recognized');
  }
  const body = groups.map((group) => `<g ${group.fill}>${group.uses.join('')}</g>`).join('');
  return { defs: defs.join(''), body };
}

function groupPaint(attributes: string): { color: string; opacity: number } | null {
  const fill = attributes.match(/(?:^|\s)fill="([^"]+)"/)?.[1];
  if (fill !== undefined) {
    const opacity = attributes.match(/(?:^|\s)fill-opacity="([^"]+)"/)?.[1] ?? '1';
    return { color: fill, opacity: Number(opacity) };
  }
  const style = attributes.match(/(?:^|\s)style="([^"]+)"/)?.[1];
  const styleFill = style?.match(/(?:^|;)\s*fill:\s*([^;]+)/)?.[1];
  if (style === undefined || styleFill === undefined) return null;
  const opacity = style.match(/(?:^|;)\s*fill-opacity:\s*([^;]+)/)?.[1] ?? '1';
  return { color: styleFill.trim(), opacity: Number(opacity.trim()) };
}

function cairoColor(value: string, opacity: number): string {
  const percents = [...value.matchAll(/(-?[\d.]+)%/g)].map((match) =>
    Math.round((Number(match[1]) / 100) * 255),
  );
  const [r = 0, g = 0, b = 0] = percents;
  return paint('fill', `rgba(${r}, ${g}, ${b}, ${opacity})`);
}

async function collectLayers(
  browser: Browser,
  artboard: Artboard,
): Promise<{ layers: Layer[]; pdf: Buffer }> {
  const page = await browser.newPage({
    viewport: { width: artboard.width, height: artboard.height },
  });
  await page.goto(`file://${artboard.file}`);
  await page.evaluate(() => document.fonts.ready);
  const raw = await page.evaluate(() => {
    const root = document.body.firstElementChild;
    if (root === null) return [];
    const origin = root.getBoundingClientRect();
    const items: unknown[] = [];
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const rect = element.getBoundingClientRect();
      const frame = {
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        w: rect.width,
        h: rect.height,
      };
      if (element.tagName.toLowerCase() === 'svg') {
        const width = element.getAttribute('width') ?? String(rect.width);
        const height = element.getAttribute('height') ?? String(rect.height);
        items.push({
          kind: 'svg',
          ...frame,
          viewBox: element.getAttribute('viewBox') ?? `0 0 ${width} ${height}`,
          inner: element.innerHTML,
        });
        continue;
      }
      if (element.closest('svg') !== null) continue;
      const style = getComputedStyle(element);
      const side = (name: 'Top' | 'Right' | 'Bottom' | 'Left') => ({
        width:
          style.getPropertyValue(`border-${name.toLowerCase()}-style`) === 'none'
            ? 0
            : Number.parseFloat(style.getPropertyValue(`border-${name.toLowerCase()}-width`)),
        color: style.getPropertyValue(`border-${name.toLowerCase()}-color`),
      });
      items.push({
        kind: 'box',
        ...frame,
        fill: style.backgroundColor,
        radii: [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].map((value) => Number.parseFloat(value) || 0),
        sides: [side('Top'), side('Right'), side('Bottom'), side('Left')],
        shadow: style.boxShadow,
      });
    }
    return items;
  });
  await page.addStyleTag({ content: HIDE_ALL_BUT_TEXT });
  const pdf = await page.pdf({
    width: `${artboard.width}px`,
    height: `${artboard.height}px`,
    printBackground: true,
  });
  await page.close();
  const layers: Layer[] = [];
  for (const item of raw as (
    | InlineSvg
    | (Omit<Box, 'shadows' | 'fill'> & { fill: string; shadow: string })
  )[]) {
    if (item.kind === 'svg') {
      layers.push(item);
      continue;
    }
    const fill = parseColor(item.fill) === null ? null : item.fill;
    const sides = item.sides.map((side) =>
      parseColor(side.color) === null ? { width: 0, color: side.color } : side,
    ) as Box['sides'];
    const shadows = parseShadows(item.shadow);
    if (fill === null && shadows.length === 0 && sides.every((side) => side.width === 0)) continue;
    layers.push({ ...item, kind: 'box', fill, sides, shadows });
  }
  return { layers, pdf };
}

function cairoSvg(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'standcast-brand-'));
  try {
    const input = join(dir, 'text.pdf');
    const output = join(dir, 'text.svg');
    writeFileSync(input, pdf);
    const result = Bun.spawnSync(['pdftocairo', '-svg', input, output]);
    if (result.exitCode !== 0) throw new Error(`pdftocairo failed: ${result.stderr.toString()}`);
    return readFileSync(output, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function artboardToSvg(browser: Browser, artboard: Artboard): Promise<string> {
  const { layers, pdf } = await collectLayers(browser, artboard);
  const text = textLayerFromCairoSvg(cairoSvg(pdf));
  const filters = new Map<number, string>();
  const shapes = layers
    .map((layer) => (layer.kind === 'svg' ? renderInlineSvg(layer) : renderBox(layer, filters)))
    .join('\n');
  const label = escapeXml(artboard.label);
  const { width, height } = artboard;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">`,
    `<title>${label}</title>`,
    `<defs>${[...filters.values()].join('')}${text.defs}</defs>`,
    shapes,
    text.body,
    '</svg>',
    '',
  ].join('\n');
}
