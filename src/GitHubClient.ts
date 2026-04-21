import * as vscode from 'vscode';
import type { PRComment } from './types';

export async function getGitHubToken(): Promise<{ token: string; userLogin: string }> {
  const session = await vscode.authentication.getSession(
    'github',
    ['repo'],
    { createIfNone: true }
  );
  return { token: session.accessToken, userLogin: session.account.label };
}

async function githubRequest<T>(
  path: string,
  token: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    method: options?.method ?? 'GET',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
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
): Promise<{ prNumber: number; headSha: string }> {
  const pulls = await githubRequest<GitHubPull[]>(
    `/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open&per_page=5`,
    token
  );
  if (pulls.length === 0) {
    throw new Error(`No open PR found for branch "${branch}" in ${owner}/${repo}.`);
  }
  return { prNumber: pulls[0].number, headSha: pulls[0].head.sha };
}

export async function fetchPrComments(
  owner: string,
  repo: string,
  prNumber: number,
  filePath: string,
  token: string
): Promise<PRComment[]> {
  const raw = await githubRequest<GitHubReviewComment[]>(
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

function mapComment(raw: GitHubReviewComment): PRComment {
  return {
    id: raw.id,
    in_reply_to_id: raw.in_reply_to_id,
    line: raw.line as number,
    body: raw.body,
    user: { login: raw.user.login, avatar_url: raw.user.avatar_url },
    created_at: raw.created_at,
  };
}

export async function postComment(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  payload: { body: string; commitId: string; path: string; line: number }
): Promise<PRComment> {
  const raw = await githubRequest<GitHubReviewComment>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    token,
    {
      method: 'POST',
      body: {
        body: payload.body,
        commit_id: payload.commitId,
        path: payload.path,
        line: payload.line,
        side: 'RIGHT',
      },
    }
  );
  return mapComment(raw);
}

export async function postReply(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  payload: { body: string; inReplyToId: number }
): Promise<PRComment> {
  const raw = await githubRequest<GitHubReviewComment>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    token,
    {
      method: 'POST',
      body: { body: payload.body, in_reply_to: payload.inReplyToId },
    }
  );
  return mapComment(raw);
}

interface GitHubReview {
  comments: GitHubReviewComment[];
}

export async function submitDraftReview(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  payload: {
    commitId: string;
    comments: Array<{ path: string; line: number; body: string }>;
  }
): Promise<PRComment[]> {
  const review = await githubRequest<GitHubReview>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    token,
    {
      method: 'POST',
      body: {
        commit_id: payload.commitId,
        body: '',
        event: 'COMMENT',
        comments: payload.comments.map(c => ({
          path: c.path,
          line: c.line,
          side: 'RIGHT',
          body: c.body,
        })),
      },
    }
  );
  return review.comments
    .filter(c => c.line != null)
    .map(mapComment);
}
