const MARK = '[redacted]';

const TOKEN_PATTERNS = [
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /(?<![A-Za-z0-9])sck_[A-Za-z0-9]{16,}/g,
  /(?<![A-Za-z0-9])sc_[A-Za-z0-9]{16,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /glpat-[A-Za-z0-9_-]{20,}/g,
];

const URL_CREDENTIALS =
  /\b([A-Za-z][A-Za-z0-9+.-]{0,31}:\/\/)[^\s/@?#"'<>:]{0,256}:[^\s/?#"'<>]{0,512}@/g;

const STRONG_LABELS =
  'password|passwd|pwd|secret|token|api_key|api-key|apikey|client_secret|access_key';
const WEAK_LABELS = 'authorization|auth|bearer|key';
const CREDENTIAL_LABEL = new RegExp(
  `(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-]){0,8}(?:${STRONG_LABELS}|${WEAK_LABELS}))(?![A-Za-z0-9])((?:\\\\?["'])?[ \\t]*[:=][ \\t]*|[ \\t]+)(\\\\?["']|)`,
  'gi',
);
const STRONG_LABEL = new RegExp(`(?:^|[_-])(?:${STRONG_LABELS})$`, 'i');
const AUTH_SCHEME = /^(?:Bearer|Basic)[ \t]+/i;
const ASSIGNMENT = /[:=]/;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;
const MIN_LABELED_VALUE = 16;

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

function isWordRun(run: string): boolean {
  const pieces = run.split(/[/\-_.]/).filter((piece) => piece.length > 0);
  return pieces.length > 0 && pieces.every((piece) => WORD_PIECE.test(piece));
}

function looksLikeSecret(run: string): boolean {
  if (isWordRun(run)) return false;
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

function redactTokens(text: string): string {
  let out = text.replace(URL_CREDENTIALS, `$1${MARK}@`);
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, MARK);
  return out;
}

function closingQuoteAt(
  text: string,
  start: number,
  quote: string,
  escapedDelimiter: boolean,
): number {
  for (let index = start; index < text.length; index++) {
    if (text[index] !== quote) continue;
    let slashes = 0;
    for (let at = index - 1; at >= start && text[at] === '\\'; at--) slashes++;
    if (escapedDelimiter ? slashes % 2 === 1 : slashes % 2 === 0)
      return index - Number(escapedDelimiter);
  }
  return -1;
}

function redactLabeled(text: string): string {
  CREDENTIAL_LABEL.lastIndex = 0;
  let output = '';
  let cursor = 0;
  for (let match = CREDENTIAL_LABEL.exec(text); match; match = CREDENTIAL_LABEL.exec(text)) {
    const [prefix = '', label = '', gap = '', opener = ''] = match;
    const valueStart = CREDENTIAL_LABEL.lastIndex;
    const quote = opener.at(-1);
    const escapedDelimiter = opener.startsWith('\\');
    const closeAt = quote ? closingQuoteAt(text, valueStart, quote, escapedDelimiter) : -1;
    const scheme = quote ? '' : (text.slice(valueStart).match(AUTH_SCHEME)?.[0] ?? '');
    const rawStart = valueStart + scheme.length;
    const raw =
      closeAt >= 0
        ? text.slice(valueStart, closeAt)
        : quote
          ? text.slice(valueStart)
          : (text.slice(rawStart).match(/^(?:\\["']|[^\s"'])+/)?.[0] ?? '');
    const value = closeAt >= 0 ? raw : raw.replace(TRAILING_PUNCTUATION, '');
    const explicit = scheme.length > 0 || (ASSIGNMENT.test(gap) && STRONG_LABEL.test(label));
    const shaped = value.length >= 8 && (/\d/.test(value) || value.length >= MIN_LABELED_VALUE);
    if (value.length === 0 || (!explicit && !shaped)) continue;

    output += text.slice(cursor, match.index) + prefix + scheme + MARK;
    if (closeAt >= 0) {
      const closingLength = escapedDelimiter ? 2 : 1;
      output += text.slice(closeAt, closeAt + closingLength);
      cursor = closeAt + closingLength;
    } else {
      output += raw.slice(value.length);
      cursor = rawStart + raw.length;
    }
    CREDENTIAL_LABEL.lastIndex = cursor;
  }
  return output + text.slice(cursor);
}

export function redact(text: string): string {
  return redactLabeled(redactTokens(text))
    .replace(URL_PATTERN, redactUrl)
    .replace(LONG_RUN, redactRun);
}

export function redactPath(path: string): string {
  return redactSegments(redactTokens(path));
}
