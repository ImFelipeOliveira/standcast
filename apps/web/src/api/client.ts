export type Installation = { id: number; owner: string };

export type Session = {
  login: string;
  avatarUrl: string;
  csrf: string;
  installations: Installation[];
};

export type OrgContext = { admin: boolean; managerOf: string[]; memberOf: string[] };

export const apiUrl: string = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let csrfToken: string | null = null;

export const SIGN_IN_MARKER = 'standcast.signInRedirectAt';
export const SIGN_IN_PATH = '/sign-in';
const SIGN_IN_LOOP_WINDOW_MS = 60_000;

export const SIGN_IN_ERRORS = [
  'access_denied',
  'invalid_state',
  'unauthorized',
  'sign_in_did_not_stick',
  'generic',
] as const;
export type SignInError = (typeof SIGN_IN_ERRORS)[number];

export type RequestOptions = { skipAuthRedirect?: boolean };

function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : (window.sessionStorage ?? null);
  } catch {
    return null;
  }
}

function readSignInMarker(): number | null {
  try {
    const value = sessionStore()?.getItem(SIGN_IN_MARKER);
    const at = value ? Number(value) : Number.NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeSignInMarker(at: number): void {
  try {
    sessionStore()?.setItem(SIGN_IN_MARKER, String(at));
  } catch {}
}

export function clearSignInMarker(): void {
  try {
    sessionStore()?.removeItem(SIGN_IN_MARKER);
  } catch {}
}

export function signInUrl(next: string): string {
  return `${apiUrl}/auth/github/login?target=app&next=${encodeURIComponent(next)}`;
}

export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (
    next === SIGN_IN_PATH ||
    next.startsWith(`${SIGN_IN_PATH}?`) ||
    next.startsWith(`${SIGN_IN_PATH}/`)
  ) {
    return '/';
  }
  return next;
}

export function signInPagePath(next: string, error?: SignInError): string {
  const query = new URLSearchParams();
  if (error) query.set('error', error);
  const target = safeNext(next);
  if (target !== '/') query.set('next', target);
  const search = query.toString();
  return search ? `${SIGN_IN_PATH}?${search}` : SIGN_IN_PATH;
}

export function markSignInStarted(): void {
  writeSignInMarker(Date.now());
}

export function currentPathAndSearch(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

function signInJustStarted(): boolean {
  const last = readSignInMarker();
  const now = Date.now();
  return last !== null && now - last >= 0 && now - last < SIGN_IN_LOOP_WINDOW_MS;
}

function redirectToSignInPage(): void {
  if (typeof window === 'undefined' || window.location.pathname === SIGN_IN_PATH) return;
  const stuck = signInJustStarted();
  clearSignInMarker();
  window.location.assign(
    signInPagePath(currentPathAndSearch(), stuck ? 'sign_in_did_not_stick' : undefined),
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const error =
    typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error: { code?: unknown; message?: unknown } }).error
      : null;
  const code = typeof error?.code === 'string' ? error.code : 'http_error';
  const message =
    typeof error?.message === 'string'
      ? error.message
      : `${response.status} ${response.statusText}`;
  return new ApiError(response.status, code, message);
}

async function request<T>(path: string, init: RequestInit, options: RequestOptions): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...init, credentials: 'include' });
  if (response.status === 401) {
    csrfToken = null;
    if (!options.skipAuthRedirect) redirectToSignInPage();
    throw await toApiError(response);
  }
  if (!response.ok) throw await toApiError(response);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, { method: 'GET', headers: { Accept: 'application/json' } }, options);
}

export async function fetchSession(options: RequestOptions = {}): Promise<Session> {
  const session = await apiGet<Session>('/v1/app/session', options);
  csrfToken = session.csrf;
  clearSignInMarker();
  return session;
}

async function sendWithCsrf<T>(
  method: 'POST' | 'DELETE',
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<T> {
  const csrf = csrfToken ?? (await fetchSession(options)).csrf;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Standcast-CSRF': csrf,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    return await request<T>(
      path,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) csrfToken = null;
    throw error;
  }
}

export function apiPost<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  return sendWithCsrf<T>('POST', path, body, options);
}

export function apiDelete<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return sendWithCsrf<T>('DELETE', path, undefined, options);
}

export function forgetSession(): void {
  csrfToken = null;
}
