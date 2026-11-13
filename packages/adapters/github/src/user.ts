import { Octokit } from '@octokit/core';

const PER_PAGE = 100;
const MAX_EMAIL_PAGES = 10;

export type UserProfile = {
  githubUserId: number;
  login: string;
  email: string | null;
  verifiedEmails: string[] | null;
  installationIds: number[];
};

type EmailEntry = { email: string; primary: boolean; verified: boolean };

async function listEmails(
  octokit: Octokit,
): Promise<{ entries: EmailEntry[]; truncated: boolean }> {
  const entries: EmailEntry[] = [];
  for (let page = 1; page <= MAX_EMAIL_PAGES; page++) {
    const response = await octokit.request('GET /user/emails', { per_page: PER_PAGE, page });
    const batch = response.data as EmailEntry[];
    entries.push(...batch);
    if (batch.length < PER_PAGE) return { entries, truncated: false };
  }
  return { entries, truncated: true };
}

export async function getUserProfile(
  userToken: string,
  opts: { fetch?: typeof fetch; appId?: number } = {},
): Promise<UserProfile> {
  const octokit = new Octokit({
    auth: userToken,
    ...(opts.fetch ? { request: { fetch: opts.fetch } } : {}),
  });
  const [user, emails, installations] = await Promise.all([
    octokit.request('GET /user'),
    listEmails(octokit),
    octokit.request('GET /user/installations', { per_page: PER_PAGE }),
  ]);
  const verified = emails.entries.filter((entry) => entry.verified);
  const primary = verified.find((entry) => entry.primary);
  const ours = (installations.data as { installations: { id: number; app_id: number }[] })
    .installations;
  return {
    githubUserId: (user.data as { id: number }).id,
    login: (user.data as { login: string }).login,
    email: primary?.email ?? null,
    verifiedEmails: emails.truncated ? null : verified.map((entry) => entry.email),
    installationIds: ours
      .filter((installation) => opts.appId === undefined || installation.app_id === opts.appId)
      .map((installation) => installation.id),
  };
}
