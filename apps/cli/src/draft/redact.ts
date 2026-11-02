const MARK = '[redacted]';

const TOKEN_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /sck_[A-Za-z0-9]{16,}/g,
  /sc_[A-Za-z0-9]{16,}/g,
  /AKIA[0-9A-Z]{16}/g,
];

const LONG_RUN = /[A-Za-z0-9+/=_.~-]{32,}/g;
const PATH_START = /^(\/|\.\/|~\/)/;
const FILE_EXTENSION = /\.[A-Za-z0-9]{1,6}$/;
const WORD_TOKEN = /^(\d+|[a-z]+\d*|[A-Z][a-z]*\d*|[A-Z]+\d*)$/;
const MAX_DENSE_RATIO = 0.3;
const MIN_DIGITS = 1;
const MIN_ENTROPY = 3.5;

function entropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

function isWordLike(segment: string): boolean {
  const dense = segment.match(/[A-Z0-9]/g)?.length ?? 0;
  if (dense / segment.length < MAX_DENSE_RATIO) return true;
  const tokens = segment.split(/[-_.]/).filter((token) => token.length > 0);
  return tokens.length > 0 && tokens.every((token) => WORD_TOKEN.test(token));
}

function isPathLike(run: string): boolean {
  const segments = run.split('/').filter((segment) => segment.length > 0);
  const last = segments.at(-1);
  if (!last) return false;
  const signal = PATH_START.test(run) || FILE_EXTENSION.test(last);
  return signal && segments.every(isWordLike);
}

function looksLikeSecret(run: string): boolean {
  return (
    (run.match(/\d/g)?.length ?? 0) >= MIN_DIGITS && entropy(run) >= MIN_ENTROPY && !isPathLike(run)
  );
}

export function redact(text: string): string {
  let out = text;
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, MARK);
  return out.replace(LONG_RUN, (run) => (looksLikeSecret(run) ? MARK : run));
}
