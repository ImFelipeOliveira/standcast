import { describe, expect, test } from 'bun:test';
import { en } from './en';
import { detectLang, translate } from './index';
import { ptBR } from './pt-BR';

describe('detectLang', () => {
  test('pt and pt-BR resolve to pt-BR', () => {
    expect(detectLang(['pt'], null)).toBe('pt-BR');
    expect(detectLang(['pt-BR', 'en'], null)).toBe('pt-BR');
  });

  test('other languages resolve to en', () => {
    expect(detectLang(['fr-FR'], null)).toBe('en');
    expect(detectLang(['en-US'], null)).toBe('en');
    expect(detectLang([], null)).toBe('en');
  });

  test('stored value wins and invalid stored is ignored', () => {
    expect(detectLang(['pt-BR'], 'en')).toBe('en');
    expect(detectLang(['en-US'], 'pt-BR')).toBe('pt-BR');
    expect(detectLang(['pt-BR'], 'xx')).toBe('pt-BR');
  });
});

describe('dictionaries', () => {
  test('dictionaries have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort());
  });

  test('translate interpolates variables', () => {
    expect(translate('en', 'greeting', { name: 'Ana' })).toBe('Hello, Ana');
    expect(translate('pt-BR', 'greeting', { name: 'Ana' })).toBe('Olá, Ana');
  });
});
