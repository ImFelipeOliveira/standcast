import { Octokit } from '@octokit/core';

export type UserProfile = {
  githubUserId: number;
  login: string;
  email: string | null;
  verifiedEmails: string[];
  installationIds: number[];
};

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
    octokit.request('GET /user/emails', { per_page: 100 }),
    octokit.request('GET /user/installations', { per_page: 100 }),
  ]);
  const entries = emails.data as { email: string; primary: boolean; verified: boolean }[];
  const verified = entries.filter((entry) => entry.verified);
  const primary = verified.find((entry) => entry.primary);
  const ours = (installations.data as { installations: { id: number; app_id: number }[] })
    .installations;
  return {
    githubUserId: (user.data as { id: number }).id,
    login: (user.data as { login: string }).login,
    email: primary?.email ?? null,
    verifiedEmails: verified.map((entry) => entry.email),
    installationIds: ours
      .filter((installation) => opts.appId === undefined || installation.app_id === opts.appId)
      .map((installation) => installation.id),
  };
}
