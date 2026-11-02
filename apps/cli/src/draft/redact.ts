const MARK = '[redacted]';

const TOKEN_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /sck_[A-Za-z0-9]{16,}/g,
  /sc_[A-Za-z0-9]{16,}/g,
  /AKIA[0-9A-Z]{16}/g,
];

const LONG_RUN = /[A-Za-z0-9+/=_-]{32,}/g;

export function redact(text: string): string {
  let out = text;
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, MARK);
  return out.replace(LONG_RUN, (run) => (/\d/.test(run) && /[A-Za-z]/.test(run) ? MARK : run));
}
