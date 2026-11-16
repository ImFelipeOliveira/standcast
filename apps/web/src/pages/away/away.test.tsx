import { beforeEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '../../api/client';
import { applyLang, translate } from '../../i18n';
import { AwayFormView } from './AwayFormView';
import { AwayProblem } from './AwayProblem';
import { awayErrorMessage } from './away-error';

const overlap = new ApiError(422, 'away_overlap', 'Already away on those days.');

function alertOf(html: string): string {
  return /<p[^>]*role="alert"[^>]*>(.*?)<\/p>/.exec(html)?.[1] ?? '';
}

describe('away errors', () => {
  beforeEach(() => applyLang('en'));

  test('the mark form renders the translated overlap message in an alert', () => {
    const html = renderToStaticMarkup(
      <AwayFormView
        from=""
        until="2026-12-05"
        onFrom={() => {}}
        onUntil={() => {}}
        pending={false}
        problem={overlap}
        onSubmit={() => {}}
      />,
    );
    expect(alertOf(html)).toBe(translate('en', 'away.error.overlap'));
    expect(alertOf(html)).not.toBe('Already away on those days.');
  });

  test('the mark form shows no alert without a problem and disables while pending', () => {
    const html = renderToStaticMarkup(
      <AwayFormView
        from=""
        until=""
        onFrom={() => {}}
        onUntil={() => {}}
        pending
        problem={null}
        onSubmit={() => {}}
      />,
    );
    expect(html).not.toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  test('a failed cancel renders the translated message in an alert', () => {
    applyLang('pt-BR');
    const forbidden = new ApiError(403, 'forbidden', 'only managers can do this');
    expect(alertOf(renderToStaticMarkup(<AwayProblem error={forbidden} />))).toBe(
      translate('pt-BR', 'away.error.forbidden'),
    );
  });

  test('each away error code maps to its own message in both languages', () => {
    const codes = {
      away_overlap: 'away.error.overlap',
      invalid_away_period: 'away.error.invalidPeriod',
      not_in_team: 'away.error.notInTeam',
      forbidden: 'away.error.forbidden',
    } as const;
    for (const lang of ['en', 'pt-BR'] as const) {
      const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
      for (const [code, key] of Object.entries(codes)) {
        const message = awayErrorMessage(t, new ApiError(422, code, 'raw server text'));
        expect(message).toBe(translate(lang, key));
        expect(message).not.toBe('raw server text');
      }
      expect(awayErrorMessage(t, new ApiError(500, 'internal', 'boom'))).toBe(
        translate(lang, 'setup.actionFailed'),
      );
    }
    expect(translate('en', 'away.error.invalidPeriod')).toContain('90');
    expect(translate('pt-BR', 'away.error.invalidPeriod')).toContain('90');
  });

  test('other failures render the generic message and no error renders nothing', () => {
    const html = renderToStaticMarkup(<AwayProblem error={new ApiError(500, 'internal', 'no')} />);
    expect(alertOf(html)).toBe(translate('en', 'setup.actionFailed'));
    expect(alertOf(html)).not.toBe('');
    expect(alertOf(html)).not.toBe('no');
    expect(renderToStaticMarkup(<AwayProblem error={null} />)).toBe('');
  });
});
