import * as vscode from 'vscode';
import type { PRComment } from './types';

// Uses VS Code's built-in GitHub auth provider. Prompts sign-in if not authenticated.
export async function getGitHubToken(): Promise<string> {
  const session = await vscode.authentication.getSession(
    'github',
    ['repo'],
    { createIfNone: true }
  );
  return session.accessToken;
}

// Thin wrapper around the GitHub REST API using global fetch (Node 18+).
async function githubGet<T>(path: string, token: string): Promise<T> {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} — ${url}`);
  }
  return res.json() as Promise<T>;
}

interface GitHubPull {
  number: number;
  head: { sha: string };
}

interface GitHubReviewComment {
  id: number;
  in_reply_to_id?: number;
  path: string;
  line: number | null;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}

export async function findPrNumber(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<number> {
  const pulls = await githubGet<GitHubPull[]>(
    `/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open&per_page=5`,
    token
  );
  if (pulls.length === 0) {
    throw new Error(`No open PR found for branch "${branch}" in ${owner}/${repo}.`);
  }
  return pulls[0].number;
}

export async function fetchPrComments(
  owner: string,
  repo: string,
  prNumber: number,
  filePath: string,
  token: string
): Promise<PRComment[]> {
  const raw = await githubGet<GitHubReviewComment[]>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`,
    token
  );

  return raw
    .filter(c => c.path === filePath && c.line != null)
    .map(c => ({
      id: c.id,
      in_reply_to_id: c.in_reply_to_id,
      line: c.line as number,
      body: c.body,
      user: { login: c.user.login, avatar_url: c.user.avatar_url },
      created_at: c.created_at,
    }));
}
