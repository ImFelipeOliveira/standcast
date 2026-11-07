import { describe, expect, test } from 'bun:test';
import { redact, redactPath } from '../../src/draft/redact';

describe('redact', () => {
  test('replaces known token shapes', () => {
    expect(redact('key sk-abcdefghijklmnop1234 here')).toBe('key [redacted] here');
    expect(redact('sk-proj_ABCDEFGHIJKLMNOP')).toBe('[redacted]');
    expect(redact('ghp_abcdefghijklmnopqrst')).toBe('[redacted]');
    expect(redact('gho_ABCDEFGHIJKLMNOPQRST and ghs_abcdefghijklmnopqrst')).toBe(
      '[redacted] and [redacted]',
    );
    expect(redact('xoxb-1234567890-abc')).toBe('[redacted]');
    expect(redact('sck_abcdefghijklmnop')).toBe('[redacted]');
    expect(redact('sc_abcdefghijklmnop')).toBe('[redacted]');
    expect(redact('aws AKIAABCDEFGHIJKLMNOP')).toBe('aws [redacted]');
  });

  test('replaces long mixed runs', () => {
    expect(redact('token: aGVsbG8gd29ybGQgaGVsbG8gd29ybGQ1234== end')).toBe(
      'token: [redacted] end',
    );
    expect(redact('key 9fQx2LmZ7pRt4WvB8nKc3HdJ6sYa1GeU0iOb end')).toBe('key [redacted] end');
    expect(redact('sha 3f2a9c0b7d1e4f5a6b8c9d0e1f2a3b4c5d6e7f80')).toBe('sha [redacted]');
    expect(redact('aws wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY end')).toBe('aws [redacted] end');
    expect(redact('x abc/DEF123ghiJKL/mno456PQR/stu789VWXyz y')).toBe('x [redacted] y');
    expect(redact('/q8Zx3kP0vLmN7wR2tYb9HcJ4sDfGa1eUoI5nQ')).toBe('[redacted]');
    expect(redact('otp JBSWY3DPEHPK3PXP4QZ7MNA2RCV6TLFG')).toBe('otp [redacted]');
    expect(redact('blob q8Zx/3kP0vLmN7wR2tYb+9HcJ4sDfGa1eUoI5nQ= end')).toBe('blob [redacted] end');
    expect(
      redact(
        'jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U end',
      ),
    ).toBe('jwt [redacted] end');
  });

  test('redacts secret segments inside paths', () => {
    expect(redact('cat /tmp/ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345/file.txt')).toBe(
      'cat /tmp/[redacted]/file.txt',
    );
    expect(redact('cat /tmp/Zq8Xv3Lm9Pw2Rt7Ky4Nb1Hc6/file.txt')).toBe(
      'cat /tmp/[redacted]/file.txt',
    );
    expect(redact('use ~/keys/9fA3kQ7zLmP2xR8vT4wN1bY6cH5jD0sE.pem')).toBe('use ~/keys/[redacted]');
    expect(redact('/srv/app/K7MDENG/releases/v2/index.ts')).toBe(
      '/srv/app/K7MDENG/releases/v2/index.ts',
    );
  });

  test('redacts credentials inside urls of any scheme', () => {
    expect(redact('db postgres://user:S3cr3tPassw0rd@db.host:5432/app now')).toBe(
      'db postgres://[redacted]@db.host:5432/app now',
    );
    expect(redact('clone https://user:token@host/x')).toBe('clone https://[redacted]@host/x');
    expect(redact('redis://:pw@cache:6379/0')).toBe('redis://[redacted]@cache:6379/0');
    expect(redact('mongodb+srv://admin:hunter2@cluster.example.net/db')).toBe(
      'mongodb+srv://[redacted]@cluster.example.net/db',
    );
    expect(redact('see https://github.com/acme/app and git@github.com:acme/app.git')).toBe(
      'see https://github.com/acme/app and git@github.com:acme/app.git',
    );
  });

  test('url credentials matching stays linear on hostile input', () => {
    const started = performance.now();
    redact(`x://${':'.repeat(40000)}`);
    expect(performance.now() - started).toBeLessThan(100);
    expect(redact('ssh://git@host')).toBe('ssh://git@host');
  });

  test('credential label matching stays linear on repeated separators', () => {
    const started = performance.now();
    redact('a-'.repeat(20000));
    expect(performance.now() - started).toBeLessThan(100);
  });

  test('redacts the whole password when it contains @', () => {
    expect(redact('db postgres://user:p@ss@db.host/app now')).toBe(
      'db postgres://[redacted]@db.host/app now',
    );
    expect(redact('https://user:pw@host/x?mail=a@b.com#c@d')).toBe(
      'https://[redacted]@host/x?mail=a@b.com#c@d',
    );
    expect(redact('https://host/x?q=a:b@c')).toBe('https://host/x?q=a:b@c');
  });

  test('token prefixes need a boundary before them', () => {
    expect(redact('feat/task-assignment-notifications')).toBe('feat/task-assignment-notifications');
    expect(redact('misc_settings and desc_abcdefghijklmnopqr')).toBe(
      'misc_settings and desc_abcdefghijklmnopqr',
    );
    expect(redact('risk-abcdefghijklmnopqr')).toBe('risk-abcdefghijklmnopqr');
    expect(redact('key=sk-abcdefghijklmnop1234')).toBe('key=[redacted]');
    expect(redact('(sc_abcdefghijklmnop)')).toBe('([redacted])');
    expect(redact('"sck_abcdefghijklmnop"')).toBe('"[redacted]"');
  });

  test('redactPath keeps ticket branches and paths and removes secrets', () => {
    expect(redactPath('feature/PROJ-4521-fix-login-redirect-loop')).toBe(
      'feature/PROJ-4521-fix-login-redirect-loop',
    );
    expect(redactPath('/home/dev/client-2024/project-alpha-v2')).toBe(
      '/home/dev/client-2024/project-alpha-v2',
    );
    expect(redactPath('feat/sk-abcdefghijklmnop1234')).toBe('feat/[redacted]');
    expect(redactPath('fix/abcDEF123ghiJKL456mn')).toBe('fix/[redacted]');
    expect(redactPath('/srv/q8Zx3kP0vLmN7wR2tYb9HcJ4sDfGa1eUoI5nQ/app')).toBe(
      '/srv/[redacted]/app',
    );
  });

  test('replaces gitlab tokens', () => {
    expect(redact('token glpat-AbCdEfGhIjKlMnOpQrSt end')).toBe('token [redacted] end');
    expect(redact('glpat-ab_cd-efghijklmnopqrstu')).toBe('[redacted]');
  });

  test('redacts secret values inside urls', () => {
    expect(redact('go to https://x.test/cb?code=4f9Kq2LmZx81PwR7tY3v&state=ok now')).toBe(
      'go to https://x.test/cb?code=[redacted]&state=ok now',
    );
    expect(redact('http://x.test/files/Zq8Xv3Lm9Pw2Rt7Ky4Nb1Hc6/raw?page=2')).toBe(
      'http://x.test/files/[redacted]/raw?page=2',
    );
    expect(redact('https://github.com/acme/shop/pull/42?tab=files#diff-1')).toBe(
      'https://github.com/acme/shop/pull/42?tab=files#diff-1',
    );
  });

  test('keeps ordinary text', () => {
    expect(redact('Fix the cart total rounding')).toBe('Fix the cart total rounding');
    expect(redact('sk-short')).toBe('sk-short');
    expect(redact('ghp_short')).toBe('ghp_short');
    expect(redact('a'.repeat(40))).toBe('a'.repeat(40));
    expect(redact('1'.repeat(40))).toBe('1'.repeat(40));
    expect(redact('abc123')).toBe('abc123');
    expect(redact('see apps/cli/src/v2/components/item42/view1234/index.ts')).toBe(
      'see apps/cli/src/v2/components/item42/view1234/index.ts',
    );
    expect(redact('open /Users/ana/projects/standcast/docs/2026-11-01-plan.md now')).toBe(
      'open /Users/ana/projects/standcast/docs/2026-11-01-plan.md now',
    );
    expect(redact('see ./apps/cli/src/draft/redact.ts')).toBe('see ./apps/cli/src/draft/redact.ts');
    expect(redact('open ~/Repositories/Personal/standcast/README.md.')).toBe(
      'open ~/Repositories/Personal/standcast/README.md.',
    );
    expect(redact('notes in docs/specs/2026-11-01-draft-from-sessions-design.md')).toBe(
      'notes in docs/specs/2026-11-01-draft-from-sessions-design.md',
    );
    expect(redact('very-long-hyphenated-compound-word-without-digits')).toBe(
      'very-long-hyphenated-compound-word-without-digits',
    );
  });

  test('keeps ticket-style names', () => {
    expect(redact('on feature/PROJ-4521-fix-login-redirect-loop now')).toBe(
      'on feature/PROJ-4521-fix-login-redirect-loop now',
    );
    expect(redact('branch fel-12-login-flow-v2')).toBe('branch fel-12-login-flow-v2');
    expect(redact('see release-2026-11-01-draft-from-sessions-rollout-plan')).toBe(
      'see release-2026-11-01-draft-from-sessions-rollout-plan',
    );
  });

  test('redacts whole runs that mix word-like and random segments', () => {
    expect(redact('key /abc/K7mDeNg9Xq/Zt4LpR2vW8yB/Qm3NxV7cD5hJ end')).toBe('key [redacted] end');
    expect(redact('key /srv/app/wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY end')).toBe(
      'key [redacted] end',
    );
  });

  test('redacts the value that follows a credential label', () => {
    expect(redact('token abcdef01-abcd-4567-aaaa-abcdef123456')).toBe('token [redacted]');
    expect(redact('API_KEY=sk_live_short123')).toBe('API_KEY=[redacted]');
    expect(redact('password: hunter2hunter2')).toBe('password: [redacted]');
    expect(redact('Authorization: Bearer abc.def.ghi1234')).toBe(
      'Authorization: Bearer [redacted]',
    );
    expect(redact('Authorization: Basic dXNlcjpwYXNzd29yZA==')).toBe(
      'Authorization: Basic [redacted]',
    );
  });

  test('keeps plain words and unlabeled ids after label-like words', () => {
    expect(redact('the key point is simple')).toBe('the key point is simple');
    expect(redact('fix the token refresh flow')).toBe('fix the token refresh flow');
    expect(redact('see run abcdef01-abcd-4567-aaaa-abcdef123456')).toBe(
      'see run abcdef01-abcd-4567-aaaa-abcdef123456',
    );
  });

  test('redacts prefixed and quoted credential labels', () => {
    expect(redact('GITHUB_TOKEN=abc')).toBe('GITHUB_TOKEN=[redacted]');
    expect(redact('MY_API_KEY: x1')).toBe('MY_API_KEY: [redacted]');
    expect(redact('db-password=hunter2')).toBe('db-password=[redacted]');
    expect(redact('{"password": "hunter2"}')).toBe('{"password": "[redacted]"}');
    expect(redact("'secret'='v'")).toBe("'secret'='[redacted]'");
    expect(redact('the secret is out')).toBe('the secret is out');
  });

  test('redacts an entire quoted credential containing escaped quotes', () => {
    expect(redact('password="abc\\"defSECRET"')).toBe('password="[redacted]"');
    expect(redact("token='ab\\'cdSECRET'")).toBe("token='[redacted]'");
    expect(redact('api_key=plainSECRET')).toBe('api_key=[redacted]');
    expect(redact(String.raw`password=\\host\share`)).toBe('password=[redacted]');
    expect(redact('before password="abc defSECRET after')).toBe('before password="[redacted]');
    expect(redact('before password="" after')).toBe('before password="" after');
  });

  test('redacts credentials whose JSON quotes are escaped', () => {
    expect(redact('\\"password\\": \\"hunter2\\"')).toBe('\\"password\\": \\"[redacted]\\"');
  });

  test('redacts escaped quotes inside unquoted credentials', () => {
    const result = redact(String.raw`password=abc\"defSECRET`);
    expect(result).toBe('password=[redacted]');
    expect(result).not.toContain('defSECRET');
  });

  test('keeps text after an escaped credential ending in an encoded backslash', () => {
    expect(redact(String.raw`\"password\": \"abc\\\" after`)).toBe(
      String.raw`\"password\": \"[redacted]\" after`,
    );
  });
});
