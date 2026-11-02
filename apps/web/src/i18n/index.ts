import { useSyncExternalStore } from 'react';
import { en } from './en';
import { ptBR } from './pt-BR';

export type Lang = 'pt-BR' | 'en';
export type MessageKey = keyof typeof ptBR;

const STORAGE_KEY = 'standcast.lang';
const dictionaries: Record<Lang, Record<MessageKey, string>> = { 'pt-BR': ptBR, en };

export function detectLang(navigatorLanguages: readonly string[], stored: string | null): Lang {
  if (stored === 'pt-BR' || stored === 'en') return stored;
  const first = navigatorLanguages[0]?.toLowerCase() ?? '';
  return first === 'pt' || first.startsWith('pt-') ? 'pt-BR' : 'en';
}

function readStoredLang(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current: Lang = detectLang(
  typeof navigator === 'undefined' ? [] : (navigator.languages ?? []),
  readStoredLang(),
);
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function applyLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const listener of listeners) listener();
}

export function setLang(lang: Lang): void {
  applyLang(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function translate(lang: Lang, key: MessageKey, vars: Record<string, string> = {}): string {
  return dictionaries[lang][key].replace(
    /\{(\w+)\}/g,
    (match, name: string) => vars[name] ?? match,
  );
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

export function useT(): (key: MessageKey, vars?: Record<string, string>) => string {
  const lang = useLang();
  return (key, vars) => translate(lang, key, vars);
}
