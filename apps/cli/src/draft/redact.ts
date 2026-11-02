const MARK = '[redacted]';

const TOKEN_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /sck_[A-Za-z0-9]{16,}/g,
  /sc_[A-Za-z0-9]{16,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /glpat-[A-Za-z0-9_-]{20,}/g,
];

const URL_CREDENTIALS = /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@"'<>]*:[^\s/@"'<>]*@/g;

const LONG_RUN = /[A-Za-z0-9+/=_.~-]{32,}/g;
const URL_PATTERN = /https?:\/\/[^\s"'<>()[\]{}]+/g;
const PATH_START = /^(\/|\.\/|~\/)/;
const FILE_EXTENSION = /\.[A-Za-z0-9]{1,6}$/;
const WORD_PIECE = /^(\d+|[a-z]+\d*|[A-Z][a-z]*\d*|[A-Z]+\d*)$/;
const PATH_MARKERS = new Set(['~', '.', '..']);
const MIN_DIGITS = 1;
const MIN_ENTROPY = 3.5;
const MIN_SECRET_SEGMENT = 20;
const MIN_SECRET_QUERY_VALUE = 16;

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
  if (PATH_MARKERS.has(segment)) return true;
  const pieces = segment.split(/[-_.]/).filter((piece) => piece.length > 0);
  return pieces.length > 0 && pieces.every((piece) => WORD_PIECE.test(piece));
}

function isSecretSegment(segment: string): boolean {
  return (
    segment.length >= MIN_SECRET_SEGMENT && !isWordLike(segment) && entropy(segment) >= MIN_ENTROPY
  );
}

function redactSegments(path: string): string {
  return path
    .split('/')
    .map((segment) => (isSecretSegment(segment) ? MARK : segment))
    .join('/');
}

function isPathLike(run: string): boolean {
  const segments = run.split('/').filter((segment) => segment.length > 0);
  const last = segments.at(-1);
  if (!last) return false;
  const signal = PATH_START.test(run) || FILE_EXTENSION.test(last);
  const named = segments.some((segment) => !PATH_MARKERS.has(segment) && isWordLike(segment));
  return signal && named;
}

function looksLikeSecret(run: string): boolean {
  return (run.match(/\d/g)?.length ?? 0) >= MIN_DIGITS && entropy(run) >= MIN_ENTROPY;
}

function redactRun(run: string): string {
  if (isPathLike(run)) {
    const segments = run.split('/').filter((segment) => segment.length > 0);
    const redacted = redactSegments(run);
    if (segments.every(isWordLike) || redacted !== run) return redacted;
    return looksLikeSecret(segments.filter((segment) => !isWordLike(segment)).join(''))
      ? MARK
      : run;
  }
  return looksLikeSecret(run) ? MARK : run;
}

function redactQuery(query: string): string {
  return query
    .split('&')
    .map((pair) => {
      const at = pair.indexOf('=');
      if (at === -1) return pair;
      const value = pair.slice(at + 1);
      const secret = value.length >= MIN_SECRET_QUERY_VALUE && entropy(value) >= MIN_ENTROPY;
      return secret ? `${pair.slice(0, at + 1)}${MARK}` : pair;
    })
    .join('&');
}

function redactUrl(url: string): string {
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : url.slice(hashAt);
  const queryAt = beforeHash.indexOf('?');
  const base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);
  const schemeEnd = base.indexOf('://') + 3;
  const scheme = base.slice(0, schemeEnd);
  const [host = '', ...segments] = base.slice(schemeEnd).split('/');
  const path = [host, ...segments.map((s) => (isSecretSegment(s) ? MARK : s))].join('/');
  return `${scheme}${path}${queryAt === -1 ? '' : `?${redactQuery(query)}`}${fragment}`;
}

export function redact(text: string): string {
  let out = text;
  out = out.replace(URL_CREDENTIALS, `$1${MARK}@`);
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, MARK);
  out = out.replace(URL_PATTERN, redactUrl);
  return out.replace(LONG_RUN, redactRun);
}
