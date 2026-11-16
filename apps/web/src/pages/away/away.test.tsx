import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '../../api/client';
import { AwayFormView } from './AwayFormView';
import { AwayProblem } from './AwayProblem';

const overlap = new ApiError(422, 'away_overlap', 'Already away on those days.');

function alertOf(html: string): string {
  return /<p[^>]*role="alert"[^>]*>(.*?)<\/p>/.exec(html)?.[1] ?? '';
}

describe('away errors', () => {
  test('the mark form renders the server message in an alert', () => {
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
    expect(alertOf(html)).toBe('Already away on those days.');
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

  test('a failed cancel renders the server message in an alert', () => {
    expect(alertOf(renderToStaticMarkup(<AwayProblem error={overlap} />))).toBe(
      'Already away on those days.',
    );
  });

  test('other failures render the generic message and no error renders nothing', () => {
    const html = renderToStaticMarkup(<AwayProblem error={new ApiError(403, 'forbidden', 'no')} />);
    expect(alertOf(html)).not.toBe('');
    expect(alertOf(html)).not.toBe('no');
    expect(renderToStaticMarkup(<AwayProblem error={null} />)).toBe('');
  });
});
