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

export function signInUrl(next: string): string {
  return `${apiUrl}/auth/github/login?target=app&next=${encodeURIComponent(next)}`;
}

export function currentPathAndSearch(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

export function redirectToSignIn(next: string): void {
  window.location.assign(signInUrl(next));
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

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...init, credentials: 'include' });
  if (response.status === 401) {
    csrfToken = null;
    redirectToSignIn(currentPathAndSearch());
    throw await toApiError(response);
  }
  if (!response.ok) throw await toApiError(response);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET', headers: { Accept: 'application/json' } });
}

export async function fetchSession(): Promise<Session> {
  const session = await apiGet<Session>('/v1/app/session');
  csrfToken = session.csrf;
  return session;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const csrf = csrfToken ?? (await fetchSession()).csrf;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Standcast-CSRF': csrf,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    return await request<T>(path, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) csrfToken = null;
    throw error;
  }
}

export function forgetSession(): void {
  csrfToken = null;
}
