import * as vscode from 'vscode';
import type { PRComment, ThreadMeta } from './types';

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
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

async function githubGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}`);
  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data as T;
}

interface GitHubPull {
  number: number;
  head: { sha: string };
}

interface GitHubReviewComment {
  id: number;
  node_id: string;
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

function mapComment(raw: GitHubReviewComment): PRComment {
  if (raw.line == null) {
    throw new Error(`mapComment: comment ${raw.id} has no line number`);
  }
  return {
    id: raw.id,
    node_id: raw.node_id,
    in_reply_to_id: raw.in_reply_to_id,
    line: raw.line,
    body: raw.body,
    user: { login: raw.user.login, avatar_url: raw.user.avatar_url },
    created_at: raw.created_at,
  };
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
    .map(mapComment);
}

interface GraphQLThreadNode {
  id: string;
  isResolved: boolean;
  comments: { nodes: Array<{ databaseId: number }> };
}

interface FetchThreadMetaResult {
  repository: {
    pullRequest: {
      reviewThreads: { nodes: GraphQLThreadNode[] };
    };
  };
}

export async function fetchThreadMeta(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<ThreadMeta[]> {
  const query = `
    query GetThreadMeta($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              comments(first: 1) {
                nodes { databaseId }
              }
            }
          }
        }
      }
    }
  `;
  const data = await githubGraphQL<FetchThreadMetaResult>(
    query,
    { owner, repo, number: prNumber },
    token
  );
  return data.repository.pullRequest.reviewThreads.nodes
    .filter(n => n.comments.nodes.length > 0)
    .map(n => ({
      nodeId: n.id,
      isResolved: n.isResolved,
      rootCommentId: n.comments.nodes[0].databaseId,
    }));
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
  payload: { body: string; inReplyToId: number; fallbackLine: number }
): Promise<PRComment> {
  const raw = await githubRequest<GitHubReviewComment>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    token,
    {
      method: 'POST',
      body: { body: payload.body, in_reply_to: payload.inReplyToId },
    }
  );
  if (raw.line == null) {
    raw.line = payload.fallbackLine;
  }
  return mapComment(raw);
}

interface GitHubReview {
  id: number;
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
  const reviewComments = await githubRequest<GitHubReviewComment[]>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${review.id}/comments`,
    token
  );
  return reviewComments
    .filter(c => c.line != null)
    .map(mapComment);
}

export async function editComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string,
  token: string
): Promise<string> {
  const raw = await githubRequest<GitHubReviewComment>(
    `/repos/${owner}/${repo}/pulls/comments/${commentId}`,
    token,
    { method: 'PATCH', body: { body } }
  );
  return raw.body;
}

export async function deleteComment(
  owner: string,
  repo: string,
  commentId: number,
  token: string
): Promise<void> {
  await githubRequest<void>(
    `/repos/${owner}/${repo}/pulls/comments/${commentId}`,
    token,
    { method: 'DELETE' }
  );
}

export async function resolveThread(threadNodeId: string, token: string): Promise<void> {
  await githubGraphQL<unknown>(
    `mutation ResolveThread($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { id }
      }
    }`,
    { threadId: threadNodeId },
    token
  );
}

export async function unresolveThread(threadNodeId: string, token: string): Promise<void> {
  await githubGraphQL<unknown>(
    `mutation UnresolveThread($threadId: ID!) {
      unresolveReviewThread(input: { threadId: $threadId }) {
        thread { id }
      }
    }`,
    { threadId: threadNodeId },
    token
  );
}
