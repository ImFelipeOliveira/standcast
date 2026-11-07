import { describe, expect, test } from 'bun:test';
import { locateConfigKey, locateConfigPath } from '../src/config-locate';

const source = `teams:
  - name: backend
    timezone: America/Boa_Vista
    remind_at: "09:30"
    digest_at: "10:00"
    chat:
      provider: slack
      channel: "#daily-backend"
members:
  alice: { slack: U0123 }
`;

describe('locateConfigPath', () => {
  test('locates a nested value by its path', () => {
    expect(locateConfigPath(source, 'teams.0.digest_at')).toEqual({ line: 5, column: 16 });
  });

  test('locates a map key path', () => {
    expect(locateConfigPath(source, 'members.alice.slack')).toEqual({ line: 10, column: 19 });
  });

  test('returns null for unknown paths and invalid yaml', () => {
    expect(locateConfigPath(source, 'teams.3.digest_at')).toBeNull();
    expect(locateConfigPath(source, 'nope')).toBeNull();
    expect(locateConfigPath('a: [', 'a')).toBeNull();
  });

  test('empty path points to the document start', () => {
    expect(locateConfigPath(source, '')).toEqual({ line: 1, column: 1 });
  });
});

describe('locateConfigKey', () => {
  test('locates the key of a block map on its own line', () => {
    expect(locateConfigPath(source, 'members')).toEqual({ line: 10, column: 3 });
    expect(locateConfigKey(source, 'members')).toEqual({ line: 9, column: 1 });
  });

  test('locates a nested key', () => {
    expect(locateConfigKey(source, 'members.alice.slack')).toEqual({ line: 10, column: 12 });
  });

  test('returns null for the document, sequence items and unknown paths', () => {
    expect(locateConfigKey(source, '')).toBeNull();
    expect(locateConfigKey(source, 'teams.0')).toBeNull();
    expect(locateConfigKey(source, 'nope')).toBeNull();
  });
});
