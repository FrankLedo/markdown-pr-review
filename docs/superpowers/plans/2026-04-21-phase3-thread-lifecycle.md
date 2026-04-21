# Phase 3 Thread Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add resolve/unresolve threads, edit own comments in-place, and delete own comments to the PR review webview, all syncing to GitHub.

**Architecture:** Extension host handles all API calls (REST for edit/delete, GraphQL for resolve); webview sends action messages and receives results. Thread metadata (node_id, resolved state) is fetched via GraphQL at load time alongside existing REST comment fetch. No optimistic updates for destructive actions — DOM updates only on API success.

**Tech Stack:** TypeScript, VSCode extension API, GitHub REST API, GitHub GraphQL API, markdown-it, existing webview message protocol.

**Implementation note:** The spec calls for an inline error message near the triggering action on edit/delete failure. This plan uses a toast instead — the thread closes on re-render (via `placeOverlays`), making a per-item inline error impractical without a more complex callback chain. A toast is acceptable for MVP.

---

## File Map

| File | Role |
|------|------|
| `src/types.ts` | Shared types — add `ThreadMeta`, extend `PRComment`, add new message variants |
| `src/GitHubClient.ts` | GitHub API calls — add `githubGraphQL`, `fetchThreadMeta`, `editComment`, `deleteComment`, `resolveThread`, `unresolveThread`; update `mapComment` |
| `src/extension.ts` | Command entry point — call `fetchThreadMeta`, pass result to `panel.render` |
| `src/ReviewPanel.ts` | Webview host — handle 4 new inbound messages, include `threadMeta` in render, add CSS |
| `webview/thread.ts` | Thread UI — add ⋯ menu (edit/delete), resolve/unresolve button, resolved-state rendering |
| `webview/overlay.ts` | Bubble placement — pass `threadMeta` + callbacks, apply resolved bubble style |
| `webview/main.ts` | Webview controller — store `threadMeta`, handle 4 new inbound messages, wire callbacks |

---

## Task 1: Update src/types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add ThreadMeta and extend PRComment**

Replace the contents of `src/types.ts` with:

```typescript
export interface PRComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  line: number;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}

export interface ThreadMeta {
  nodeId: string;
  isResolved: boolean;
  rootCommentId: number;
}

export interface RenderMessage {
  type: 'render';
  markdown: string;
  comments: PRComment[];
  threadMeta: ThreadMeta[];
  filePath: string;
  headSha: string;
  currentUserLogin: string;
}

// Messages sent from the webview to the extension host
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'postComment'; line: number; body: string; tempId: number }
  | { type: 'postReply'; inReplyToId: number; line: number; body: string; tempId: number }
  | { type: 'addToDraft'; line: number; body: string }
  | { type: 'submitReview' }
  | { type: 'editComment'; commentId: number; body: string }
  | { type: 'deleteComment'; commentId: number }
  | { type: 'resolveThread'; threadNodeId: string }
  | { type: 'unresolveThread'; threadNodeId: string };

// Messages sent from the extension host to the webview
export type ExtensionMessage =
  | RenderMessage
  | { type: 'commentPosted'; comment: PRComment; tempId: number }
  | { type: 'replyPosted'; comment: PRComment; tempId: number }
  | { type: 'reviewSubmitted'; comments: PRComment[] }
  | { type: 'postError'; message: string; tempId?: number; source?: string }
  | { type: 'commentEdited'; commentId: number; body: string }
  | { type: 'commentDeleted'; commentId: number }
  | { type: 'threadResolved'; threadNodeId: string }
  | { type: 'threadUnresolved'; threadNodeId: string };
```

- [ ] **Step 2: Compile to verify no type errors**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review"
npx tsc --noEmit
```

Expected: errors only from files not yet updated (PRComment.node_id missing in mapComment, etc.). Fix only if there are errors in `src/types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: extend types for phase 3 — ThreadMeta, edit/delete/resolve messages"
```

---

## Task 2: Update src/GitHubClient.ts

**Files:**
- Modify: `src/GitHubClient.ts`

- [ ] **Step 1: Add GraphQL helper and update githubRequest for 204 responses**

Replace `src/GitHubClient.ts` with:

```typescript
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
```

- [ ] **Step 2: Compile to verify**

```bash
npx tsc --noEmit
```

Expected: errors only from files not yet updated (ReviewPanel.ts, extension.ts). No errors inside `src/GitHubClient.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/GitHubClient.ts
git commit -m "feat: add githubGraphQL, fetchThreadMeta, editComment, deleteComment, resolveThread, unresolveThread"
```

---

## Task 3: Update src/extension.ts and src/ReviewPanel.ts

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/ReviewPanel.ts`

- [ ] **Step 1: Update extension.ts to fetch threadMeta and pass it to render**

Replace `src/extension.ts` with:

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ReviewPanel } from './ReviewPanel';
import { getGitContext } from './GitContext';
import {
  getGitHubToken,
  findPrNumber,
  fetchPrComments,
  fetchThreadMeta,
} from './GitHubClient';

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand(
    'markdown-pr-review.openReview',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Open a markdown file first.');
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const markdown = editor.document.getText();

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Loading PR comments…',
            cancellable: false,
          },
          async () => {
            const { owner, repo, branch, repoRoot } = getGitContext(path.dirname(filePath));

            const realFilePath = fs.realpathSync(filePath);
            const relPath = path.relative(repoRoot, realFilePath).replace(/\\/g, '/');

            const { token, userLogin } = await getGitHubToken();
            const { prNumber, headSha } = await findPrNumber(owner, repo, branch, token);
            const comments = await fetchPrComments(owner, repo, prNumber, relPath, token);

            // Non-fatal: if GraphQL fails, render without thread metadata
            let threadMeta = [];
            try {
              threadMeta = await fetchThreadMeta(owner, repo, prNumber, token);
            } catch (err) {
              console.warn('fetchThreadMeta failed:', err);
            }

            const panel = ReviewPanel.createOrShow(context.extensionUri);
            panel.render(markdown, comments, threadMeta, {
              owner,
              repo,
              prNumber,
              headSha,
              filePath: relPath,
              currentUserLogin: userLogin,
            });
          }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`PR Review: ${message}`);
      }
    }
  );

  context.subscriptions.push(command);
}

export function deactivate(): void {}
```

- [ ] **Step 2: Update PrContext and render signature in ReviewPanel.ts**

Update the `PrContext` interface and `render` method. The `render` method now accepts `threadMeta` as a second argument:

```typescript
export interface PrContext {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  filePath: string;
  currentUserLogin: string;
}
```

Update `render` method signature and body:

```typescript
render(markdown: string, comments: PRComment[], threadMeta: ThreadMeta[], ctx: PrContext): void {
  this._owner = ctx.owner;
  this._repo = ctx.repo;
  this._prNumber = ctx.prNumber;
  this._headSha = ctx.headSha;
  this._filePath = ctx.filePath;
  this._draftComments = [];

  const fileName = ctx.filePath.split('/').pop() ?? ctx.filePath;
  this._panel.title = `PR Review: ${fileName}`;

  this._panel.webview.postMessage({
    type: 'render',
    markdown,
    comments,
    threadMeta,
    filePath: ctx.filePath,
    headSha: ctx.headSha,
    currentUserLogin: ctx.currentUserLogin,
  });
}
```

Add the import for `ThreadMeta` at the top of `ReviewPanel.ts`:

```typescript
import type { PRComment, ThreadMeta, WebviewMessage } from './types';
```

- [ ] **Step 3: Handle 4 new inbound message types in _handleMessage**

Update the import line in ReviewPanel.ts to include the new client functions:

```typescript
import { postComment, postReply, submitDraftReview, getGitHubToken,
         editComment, deleteComment, resolveThread, unresolveThread } from './GitHubClient';
```

Add handling inside `_handleMessage`, inside the `try` block after the existing `submitReview` branch:

```typescript
} else if (msg.type === 'editComment') {
  const newBody = await editComment(this._owner, this._repo, msg.commentId, msg.body, token);
  this._panel.webview.postMessage({ type: 'commentEdited', commentId: msg.commentId, body: newBody });

} else if (msg.type === 'deleteComment') {
  await deleteComment(this._owner, this._repo, msg.commentId, token);
  this._panel.webview.postMessage({ type: 'commentDeleted', commentId: msg.commentId });

} else if (msg.type === 'resolveThread') {
  await resolveThread(msg.threadNodeId, token);
  this._panel.webview.postMessage({ type: 'threadResolved', threadNodeId: msg.threadNodeId });

} else if (msg.type === 'unresolveThread') {
  await unresolveThread(msg.threadNodeId, token);
  this._panel.webview.postMessage({ type: 'threadUnresolved', threadNodeId: msg.threadNodeId });
}
```

Update the catch block to include a `source` field so the webview can route errors correctly:

```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const source =
    msg.type === 'submitReview' ? 'draft' :
    (msg.type === 'editComment' || msg.type === 'deleteComment' ||
     msg.type === 'resolveThread' || msg.type === 'unresolveThread') ? 'action' :
    undefined;
  this._panel.webview.postMessage({ type: 'postError', message, tempId, source });
}
```

- [ ] **Step 4: Add CSS for new UI elements in _buildHtml**

Inside the `<style>` block in `_buildHtml`, add after the last existing rule (`.pr-toast`):

```css
    .pr-bubble.pr-resolved {
      opacity: 0.55;
      background: var(--vscode-disabledForeground, #6e6e6e);
    }
    .pr-thread-resolved-banner {
      font-size: 12px;
      color: var(--vscode-gitDecoration-ignoredResourceForeground, #8a8a8a);
      margin-bottom: 8px;
      font-style: italic;
    }
    .pr-thread-item { position: relative; }
    .pr-dot-menu-btn {
      position: absolute; top: 4px; right: 4px;
      background: none; border: none;
      color: var(--vscode-editor-foreground); cursor: pointer;
      padding: 2px 6px; border-radius: 3px;
      font-size: 14px; line-height: 1; opacity: 0;
    }
    .pr-thread-item:hover .pr-dot-menu-btn { opacity: 0.7; }
    .pr-dot-menu-btn:hover { opacity: 1 !important; background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
    .pr-dot-menu {
      position: absolute; top: 24px; right: 4px;
      background: var(--vscode-menu-background, #2d2d2d);
      border: 1px solid var(--vscode-menu-border, rgba(255,255,255,0.2));
      border-radius: 4px; padding: 4px 0; z-index: 400;
      min-width: 100px; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .pr-dot-menu-item {
      padding: 5px 12px; font-size: 12px; cursor: pointer; white-space: nowrap;
    }
    .pr-dot-menu-item:hover {
      background: var(--vscode-menu-selectionBackground, #094771);
      color: var(--vscode-menu-selectionForeground, #fff);
    }
    .pr-dot-menu-item.pr-delete-item { color: var(--vscode-errorForeground, #f48771); }
    .pr-delete-confirm { font-size: 12px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .pr-btn-danger {
      background: var(--vscode-errorForeground, #f48771); color: #fff;
      border: none; border-radius: 4px; padding: 3px 10px; font-size: 12px; cursor: pointer;
    }
    .pr-btn-danger:hover { opacity: 0.9; }
    .pr-btn-danger:disabled { opacity: 0.5; cursor: default; }
    .pr-resolve-btn {
      background: none;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.2));
      color: var(--vscode-editor-foreground);
      padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
    }
    .pr-resolve-btn:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
    .pr-resolve-btn:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 5: Compile to verify**

```bash
npx tsc --noEmit
```

Expected: errors only in webview files not yet updated. No errors in `src/`.

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts src/ReviewPanel.ts
git commit -m "feat: wire fetchThreadMeta, handle edit/delete/resolve messages in ReviewPanel"
```

---

## Task 4: Update webview/thread.ts

**Files:**
- Modify: `webview/thread.ts`

This task refactors `toggleThread` to accept an options object (instead of bare `onReply`) and adds ⋯ menu, resolve/unresolve button, and resolved-state rendering.

- [ ] **Step 1: Rewrite webview/thread.ts**

Replace the entire contents of `webview/thread.ts`:

```typescript
import type { PRComment } from '../src/types';
import { renderMarkdown } from './renderer';

export type OnReply = (panel: HTMLElement, rootId: number, line: number) => void;

export interface ThreadOptions {
  onReply?: OnReply;
  threadNodeId?: string;
  isResolved?: boolean;
  currentUserLogin?: string;
  onResolve?: (nodeId: string) => void;
  onUnresolve?: (nodeId: string) => void;
  onEdit?: (commentId: number, newBody: string) => void;
  onDelete?: (commentId: number) => void;
}

function closeDotMenus(container: HTMLElement): void {
  container.querySelectorAll('.pr-dot-menu').forEach(m => m.remove());
}

function startEdit(
  item: HTMLElement,
  comment: PRComment,
  bodyEl: HTMLElement,
  options: ThreadOptions
): void {
  const originalHTML = bodyEl.innerHTML;

  const textarea = document.createElement('textarea');
  textarea.className = 'pr-compose textarea';
  // Inline the textarea style so it works without a wrapper
  textarea.style.cssText = 'width:100%;min-height:60px;background:var(--vscode-input-background,transparent);color:var(--vscode-input-foreground,inherit);border:1px solid var(--vscode-input-border,rgba(255,255,255,0.2));border-radius:3px;padding:6px;font-family:var(--vscode-font-family);font-size:13px;resize:vertical;box-sizing:border-box;display:block;margin-bottom:6px;';
  textarea.value = comment.body;

  const actions = document.createElement('div');
  actions.className = 'pr-compose-actions';

  const updateBtn = document.createElement('button');
  updateBtn.className = 'pr-btn-primary';
  updateBtn.textContent = 'Update comment';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pr-btn-secondary';
  cancelBtn.textContent = 'Cancel';

  actions.appendChild(updateBtn);
  actions.appendChild(cancelBtn);

  bodyEl.innerHTML = '';
  bodyEl.appendChild(textarea);
  bodyEl.appendChild(actions);
  textarea.focus();

  cancelBtn.addEventListener('click', () => {
    bodyEl.innerHTML = originalHTML;
  });

  updateBtn.addEventListener('click', () => {
    const newBody = textarea.value.trim();
    if (!newBody) return;
    if (newBody === comment.body) { bodyEl.innerHTML = originalHTML; return; }
    updateBtn.disabled = true;
    cancelBtn.disabled = true;
    options.onEdit?.(comment.id, newBody);
  });
}

function startDelete(
  item: HTMLElement,
  comment: PRComment,
  bodyEl: HTMLElement,
  options: ThreadOptions
): void {
  const originalHTML = bodyEl.innerHTML;

  const confirm = document.createElement('div');
  confirm.className = 'pr-delete-confirm';
  confirm.textContent = 'Delete this comment?\u00a0';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'pr-btn-danger';
  deleteBtn.textContent = 'Delete';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pr-btn-secondary';
  cancelBtn.textContent = 'Cancel';

  confirm.appendChild(deleteBtn);
  confirm.appendChild(cancelBtn);

  bodyEl.innerHTML = '';
  bodyEl.appendChild(confirm);

  cancelBtn.addEventListener('click', () => { bodyEl.innerHTML = originalHTML; });
  deleteBtn.addEventListener('click', () => {
    deleteBtn.disabled = true;
    cancelBtn.disabled = true;
    options.onDelete?.(comment.id);
  });
}

function addDotMenu(
  item: HTMLElement,
  comment: PRComment,
  bodyEl: HTMLElement,
  options: ThreadOptions
): void {
  const btn = document.createElement('button');
  btn.className = 'pr-dot-menu-btn';
  btn.textContent = '⋯';
  btn.title = 'More actions';
  item.appendChild(btn);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = item.querySelector('.pr-dot-menu');
    if (existing) { existing.remove(); return; }
    closeDotMenus(item.closest('.pr-thread') as HTMLElement ?? document.body);

    const menu = document.createElement('div');
    menu.className = 'pr-dot-menu';

    const editItem = document.createElement('div');
    editItem.className = 'pr-dot-menu-item';
    editItem.textContent = 'Edit';
    editItem.addEventListener('click', () => {
      menu.remove();
      startEdit(item, comment, bodyEl, options);
    });

    const deleteItem = document.createElement('div');
    deleteItem.className = 'pr-dot-menu-item pr-delete-item';
    deleteItem.textContent = 'Delete';
    deleteItem.addEventListener('click', () => {
      menu.remove();
      startDelete(item, comment, bodyEl, options);
    });

    menu.appendChild(editItem);
    menu.appendChild(deleteItem);
    item.appendChild(menu);

    const dismiss = (): void => { menu.remove(); };
    setTimeout(() => document.addEventListener('click', dismiss, { once: true }), 0);
  });
}

export function toggleThread(
  bubble: HTMLElement,
  comments: PRComment[],
  threadId: number,
  options?: ThreadOptions
): void {
  const existing = document.querySelector(`[data-thread-for="${threadId}"]`);
  if (existing) {
    existing.remove();
    return;
  }

  const parent = bubble.closest('[data-line]') as HTMLElement | null;
  if (!parent) return;

  const panel = document.createElement('div');
  panel.className = 'pr-thread';
  panel.dataset.threadFor = String(threadId);

  if (options?.isResolved) {
    const banner = document.createElement('div');
    banner.className = 'pr-thread-resolved-banner';
    banner.textContent = '✓ Resolved conversation';
    panel.appendChild(banner);
  }

  for (const comment of comments) {
    const item = document.createElement('div');
    item.className = 'pr-thread-item';

    const header = document.createElement('div');
    header.className = 'pr-thread-header';

    const avatar = document.createElement('img');
    avatar.src = comment.user.avatar_url;
    avatar.alt = comment.user.login;
    avatar.className = 'pr-thread-avatar';

    const login = document.createElement('strong');
    login.textContent = comment.user.login;

    const time = document.createElement('time');
    time.textContent = new Date(comment.created_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    time.title = new Date(comment.created_at).toLocaleString();

    header.appendChild(avatar);
    header.appendChild(login);
    header.appendChild(time);

    const body = document.createElement('div');
    body.className = 'pr-thread-body';
    body.innerHTML = renderMarkdown(comment.body);

    item.appendChild(header);
    item.appendChild(body);

    // ⋯ menu — own comments only
    if (
      options?.currentUserLogin &&
      comment.user.login === options.currentUserLogin
    ) {
      addDotMenu(item, comment, body, options);
    }

    panel.appendChild(item);
  }

  const footer = document.createElement('div');
  footer.className = 'pr-thread-footer';
  footer.style.display = 'flex';
  footer.style.gap = '6px';
  footer.style.marginTop = '8px';

  if (options?.onReply) {
    const replyBtn = document.createElement('button');
    replyBtn.className = 'pr-reply-btn';
    replyBtn.textContent = 'Reply';
    replyBtn.addEventListener('click', () => {
      const rootComment = comments.find(c => !c.in_reply_to_id) ?? comments[0];
      options.onReply!(panel, rootComment.id, rootComment.line);
    });
    footer.appendChild(replyBtn);
  }

  if (options?.threadNodeId) {
    if (options.isResolved) {
      const unresolveBtn = document.createElement('button');
      unresolveBtn.className = 'pr-resolve-btn';
      unresolveBtn.textContent = 'Unresolve';
      unresolveBtn.addEventListener('click', () => {
        unresolveBtn.disabled = true;
        unresolveBtn.textContent = 'Unresolving…';
        options.onUnresolve?.(options.threadNodeId!);
      });
      footer.appendChild(unresolveBtn);
    } else {
      const resolveBtn = document.createElement('button');
      resolveBtn.className = 'pr-resolve-btn';
      resolveBtn.textContent = 'Resolve conversation';
      resolveBtn.addEventListener('click', () => {
        resolveBtn.disabled = true;
        resolveBtn.textContent = 'Resolving…';
        options.onResolve?.(options.threadNodeId!);
      });
      footer.appendChild(resolveBtn);
    }
  }

  panel.appendChild(footer);
  parent.insertAdjacentElement('afterend', panel);
}
```

- [ ] **Step 2: Compile to verify**

```bash
npx tsc --noEmit
```

Expected: errors in `overlay.ts` (mismatched `toggleThread` call signature). No errors in `webview/thread.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add webview/thread.ts
git commit -m "feat: refactor toggleThread to options object; add dot menu, resolve/unresolve button"
```

---

## Task 5: Update webview/overlay.ts

**Files:**
- Modify: `webview/overlay.ts`

- [ ] **Step 1: Update placeOverlays to accept threadMeta and callbacks**

Replace the entire contents of `webview/overlay.ts`:

```typescript
import type { PRComment, ThreadMeta } from '../src/types';
import { toggleThread, type OnReply, type ThreadOptions } from './thread';

interface Thread {
  rootId: number;
  line: number;
  comments: PRComment[];
}

export interface OverlayCallbacks {
  onReply?: OnReply;
  currentUserLogin?: string;
  onResolve?: (threadNodeId: string) => void;
  onUnresolve?: (threadNodeId: string) => void;
  onEdit?: (commentId: number, newBody: string) => void;
  onDelete?: (commentId: number) => void;
}

function buildThreads(comments: PRComment[]): Thread[] {
  const roots = new Map<number, Thread>();
  for (const c of comments) {
    if (!c.in_reply_to_id) {
      roots.set(c.id, { rootId: c.id, line: c.line, comments: [c] });
    }
  }
  for (const c of comments) {
    if (c.in_reply_to_id) {
      const root = roots.get(c.in_reply_to_id);
      if (root) root.comments.push(c);
    }
  }
  return Array.from(roots.values());
}

export function findAnchorElement(container: HTMLElement, line: number): HTMLElement | null {
  const elements = Array.from(container.querySelectorAll('[data-line]')) as HTMLElement[];
  let best: HTMLElement | null = null;
  let bestLine = -1;
  for (const el of elements) {
    const elLine = parseInt(el.dataset['line']!, 10);
    if (elLine < line && elLine > bestLine) {
      best = el;
      bestLine = elLine;
    }
  }
  return best;
}

function createBubble(
  thread: Thread,
  meta: ThreadMeta | undefined,
  callbacks?: OverlayCallbacks
): HTMLElement {
  const isResolved = meta?.isResolved ?? false;

  const bubble = document.createElement('span');
  bubble.className = isResolved ? 'pr-bubble pr-resolved' : 'pr-bubble';
  bubble.title = isResolved
    ? `✓ Resolved — ${thread.comments[0].user.login}: ${thread.comments[0].body.slice(0, 60)}`
    : `${thread.comments[0].user.login}: ${thread.comments[0].body.slice(0, 80)}`;

  if (isResolved) {
    const check = document.createElement('span');
    check.textContent = '✓';
    check.style.fontSize = '10px';
    bubble.appendChild(check);
  } else {
    const avatar = document.createElement('img');
    avatar.src = thread.comments[0].user.avatar_url;
    avatar.alt = thread.comments[0].user.login;
    avatar.className = 'pr-bubble-avatar';
    bubble.appendChild(avatar);

    if (thread.comments.length > 1) {
      const count = document.createElement('span');
      count.textContent = String(thread.comments.length);
      bubble.appendChild(count);
    }
  }

  const options: ThreadOptions = {
    onReply: callbacks?.onReply,
    threadNodeId: meta?.nodeId,
    isResolved,
    currentUserLogin: callbacks?.currentUserLogin,
    onResolve: callbacks?.onResolve,
    onUnresolve: callbacks?.onUnresolve,
    onEdit: callbacks?.onEdit,
    onDelete: callbacks?.onDelete,
  };

  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleThread(bubble, thread.comments, thread.rootId, options);
  });

  return bubble;
}

export function placeOverlays(
  container: HTMLElement,
  comments: PRComment[],
  threadMeta: ThreadMeta[],
  callbacks?: OverlayCallbacks
): void {
  container.querySelectorAll('.pr-bubble, .pr-thread').forEach(el => el.remove());
  if (comments.length === 0) return;
  const threads = buildThreads(comments);
  for (const thread of threads) {
    const anchor = findAnchorElement(container, thread.line);
    if (!anchor) continue;
    const meta = threadMeta.find(m => m.rootCommentId === thread.rootId);
    const bubble = createBubble(thread, meta, callbacks);
    const floatTarget = anchor.tagName.toLowerCase() === 'li'
      ? ((anchor.querySelector(':scope > p') as HTMLElement) ?? anchor)
      : anchor;
    floatTarget.prepend(bubble);
  }
}

// Resolves the nearest data-line ancestor of the current selection start.
function resolveSelectionAnchor(
  container: HTMLElement
): { anchor: HTMLElement; line: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
  if (!el) return null;

  let candidate: HTMLElement | null = el;
  while (candidate && candidate !== container) {
    if (candidate.dataset['line']) {
      return { anchor: candidate, line: parseInt(candidate.dataset['line'], 10) };
    }
    candidate = candidate.parentElement;
  }

  const allLines = Array.from(container.querySelectorAll('[data-line]')) as HTMLElement[];
  const selTop = range.getBoundingClientRect().top;
  let best: HTMLElement | null = null;
  for (const lineEl of allLines) {
    if (lineEl.getBoundingClientRect().top <= selTop) best = lineEl;
  }
  if (!best) return null;
  return { anchor: best, line: parseInt(best.dataset['line']!, 10) };
}

let floatBtn: HTMLButtonElement | null = null;
let contextMenu: HTMLElement | null = null;

function removeFloatBtn(): void { floatBtn?.remove(); floatBtn = null; }
function removeContextMenu(): void { contextMenu?.remove(); contextMenu = null; }

export function initSelectionHandlers(
  container: HTMLElement,
  onAddComment: (anchor: HTMLElement, line: number) => void
): void {
  document.addEventListener('mouseup', () => {
    removeFloatBtn();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const resolved = resolveSelectionAnchor(container);
    if (!resolved) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const btn = document.createElement('button');
    btn.className = 'pr-add-btn';
    btn.textContent = '+ Add comment';
    btn.style.left = '0px';
    btn.style.top = `${rect.top - 34}px`;

    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('mouseup', (e) => e.stopPropagation());
    btn.addEventListener('click', () => {
      removeFloatBtn();
      onAddComment(resolved.anchor, resolved.line);
      window.getSelection()?.removeAllRanges();
    });

    document.body.appendChild(btn);
    btn.style.left = `${Math.max(4, rect.right - btn.offsetWidth)}px`;
    floatBtn = btn;
  });

  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) removeFloatBtn();
  });

  container.addEventListener('contextmenu', (e) => {
    removeContextMenu();
    const resolved = resolveSelectionAnchor(container);
    if (!resolved) return;

    e.preventDefault();

    const menu = document.createElement('div');
    menu.className = 'pr-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const item = document.createElement('div');
    item.className = 'pr-context-item';
    item.textContent = '+ Add comment';
    item.addEventListener('click', () => {
      removeContextMenu();
      onAddComment(resolved.anchor, resolved.line);
      window.getSelection()?.removeAllRanges();
    });

    menu.appendChild(item);
    document.body.appendChild(menu);
    contextMenu = menu;

    const dismiss = (): void => {
      removeContextMenu();
      document.removeEventListener('click', dismiss);
    };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  });
}
```

- [ ] **Step 2: Compile to verify**

```bash
npx tsc --noEmit
```

Expected: errors only in `webview/main.ts` (mismatched `placeOverlays` call). No errors in `webview/overlay.ts`.

- [ ] **Step 3: Commit**

```bash
git add webview/overlay.ts
git commit -m "feat: update placeOverlays to accept threadMeta and action callbacks; resolved bubble style"
```

---

## Task 6: Update webview/main.ts

**Files:**
- Modify: `webview/main.ts`

- [ ] **Step 1: Rewrite main.ts to store threadMeta and handle new messages**

Replace the entire contents of `webview/main.ts`:

```typescript
import { renderMarkdown } from './renderer';
import { placeOverlays, initSelectionHandlers, type OverlayCallbacks } from './overlay';
import { createComposeBox } from './compose';
import { DraftManager } from './draft';
import type { ExtensionMessage, PRComment, RenderMessage, ThreadMeta } from '../src/types';

declare const mermaid: {
  initialize(opts: object): void;
  run(opts: { nodes: NodeList | HTMLElement[] }): Promise<void>;
};

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

let allComments: PRComment[] = [];
let allThreadMeta: ThreadMeta[] = [];
let currentUserLogin = '';
let draft!: DraftManager;
let contentEl: HTMLElement | null = null;
let selectionHandlersReady = false;

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'pr-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function buildCallbacks(): OverlayCallbacks {
  return {
    onReply: (panel, rootId, line) => {
      panel.querySelector('.pr-compose')?.remove();
      const box = createComposeBox({
        hasDraft: () => draft.count > 0,
        onPostImmediately: (body) => {
          const tempId = -Date.now();
          allComments.push({
            id: tempId,
            node_id: '',
            in_reply_to_id: rootId,
            line,
            body,
            user: { login: currentUserLogin, avatar_url: '' },
            created_at: new Date().toISOString(),
          });
          box.remove();
          placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
          vscode.postMessage({ type: 'postReply', inReplyToId: rootId, line, body, tempId });
        },
        onAddToDraft: (body) => { draft.add(line, body); },
        onCancel: () => {},
      });
      panel.appendChild(box);
    },
    currentUserLogin,
    onEdit: (commentId, newBody) => {
      vscode.postMessage({ type: 'editComment', commentId, body: newBody });
    },
    onDelete: (commentId) => {
      vscode.postMessage({ type: 'deleteComment', commentId });
    },
    onResolve: (threadNodeId) => {
      vscode.postMessage({ type: 'resolveThread', threadNodeId });
    },
    onUnresolve: (threadNodeId) => {
      vscode.postMessage({ type: 'unresolveThread', threadNodeId });
    },
  };
}

function insertComposeAfter(anchor: HTMLElement, box: HTMLElement): void {
  const tag = anchor.tagName.toLowerCase();
  if (tag === 'li') {
    anchor.querySelector('.pr-compose')?.remove();
    anchor.appendChild(box);
    return;
  }
  if (anchor.parentElement?.tagName.toLowerCase() === 'li') {
    anchor.parentElement.querySelector('.pr-compose')?.remove();
    anchor.parentElement.appendChild(box);
    return;
  }
  anchor.nextElementSibling?.classList.contains('pr-compose') && anchor.nextElementSibling.remove();
  anchor.insertAdjacentElement('afterend', box);
}

function onAddComment(anchor: HTMLElement, line: number): void {
  const box = createComposeBox({
    hasDraft: () => draft.count > 0,
    onPostImmediately: (body) => {
      const tempId = -Date.now();
      allComments.push({
        id: tempId,
        node_id: '',
        line: line + 1,
        body,
        user: { login: currentUserLogin, avatar_url: '' },
        created_at: new Date().toISOString(),
      });
      box.remove();
      placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
      vscode.postMessage({ type: 'postComment', line, body, tempId });
    },
    onAddToDraft: (body) => { draft.add(line, body); },
    onCancel: () => {},
  });
  insertComposeAfter(anchor, box);
}

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  if (msg.type === 'render') {
    handleRender(msg).catch(console.error);
    return;
  }

  if (msg.type === 'commentPosted' || msg.type === 'replyPosted') {
    allComments = allComments.map(c => c.id === msg.tempId ? msg.comment : c);
    placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
    return;
  }

  if (msg.type === 'reviewSubmitted') {
    allComments = [...allComments, ...msg.comments];
    draft.clear();
    placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
    return;
  }

  if (msg.type === 'commentEdited') {
    allComments = allComments.map(c =>
      c.id === msg.commentId ? { ...c, body: msg.body } : c
    );
    placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
    return;
  }

  if (msg.type === 'commentDeleted') {
    allComments = allComments.filter(c => c.id !== msg.commentId && c.in_reply_to_id !== msg.commentId);
    placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
    return;
  }

  if (msg.type === 'threadResolved') {
    allThreadMeta = allThreadMeta.map(m =>
      m.nodeId === msg.threadNodeId ? { ...m, isResolved: true } : m
    );
    placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
    return;
  }

  if (msg.type === 'threadUnresolved') {
    allThreadMeta = allThreadMeta.map(m =>
      m.nodeId === msg.threadNodeId ? { ...m, isResolved: false } : m
    );
    placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
    return;
  }

  if (msg.type === 'postError') {
    if (msg.tempId != null) {
      allComments = allComments.filter(c => c.id !== msg.tempId);
      placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
      showToast(`Failed to post — ${msg.message}`);
    } else if (msg.source === 'draft') {
      draft.showError(`Submit failed — ${msg.message}`);
    } else {
      placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
      showToast(`Action failed — ${msg.message}`);
    }
  }
});

async function handleRender(msg: RenderMessage): Promise<void> {
  contentEl = document.getElementById('content');
  if (!contentEl) return;

  currentUserLogin = msg.currentUserLogin;
  allComments = [...msg.comments];
  allThreadMeta = [...msg.threadMeta];

  contentEl.innerHTML = renderMarkdown(msg.markdown);

  const isDark =
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast');

  mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });

  const mermaidNodes = contentEl.querySelectorAll<HTMLElement>('.mermaid');
  if (mermaidNodes.length > 0) {
    await mermaid.run({ nodes: mermaidNodes });
  }

  placeOverlays(contentEl, allComments, allThreadMeta, buildCallbacks());

  const header = document.getElementById('review-header')!;
  draft?.clear();
  draft = new DraftManager(vscode, header);

  if (!selectionHandlersReady) {
    initSelectionHandlers(contentEl, onAddComment);
    selectionHandlersReady = true;
  }
}
```

Note: `commentDeleted` also filters replies to the deleted comment (`c.in_reply_to_id !== msg.commentId`) since deleting a root comment removes the whole thread on GitHub.

- [ ] **Step 2: Full compile — all files**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add webview/main.ts
git commit -m "feat: store threadMeta in main; handle commentEdited, commentDeleted, threadResolved, threadUnresolved"
```

---

## Task 7: Build, create fixture branch, and manual test

**Files:**
- New branch: `test/fixture-comments`

- [ ] **Step 1: Build the extension**

```bash
npm run compile
```

Expected: output in `dist/`. No TypeScript errors.

- [ ] **Step 2: Create the fixture branch with seeded content**

```bash
git checkout -b test/fixture-comments
```

Add a few comment-worthy lines to `docs/ARCHITECTURE.md`. The file already exists — just make a small edit to create a meaningful diff so GitHub can anchor comments (e.g., add a paragraph at the bottom). Commit and push:

```bash
git add docs/ARCHITECTURE.md
git commit -m "test: fixture content for phase 3 manual testing"
git push -u origin test/fixture-comments
```

Then on GitHub.com:
1. Open a PR from `test/fixture-comments` → `main`
2. Add comments covering these scenarios:
   - A multi-comment thread (leave a comment, then reply to it)
   - Resolve one of the threads on GitHub.com directly
   - Leave a comment as your own user (to test edit/delete)
   - Leave a single-comment thread (to test delete-last behaviour)
3. Note the PR number — reuse this PR for all Phase 3 (and Phase 4) testing.

```bash
git checkout main
```

- [ ] **Step 3: Launch extension and run test checklist**

Press `F5` in VSCode to launch the Extension Development Host. Open the fixture markdown file. Run **"Open PR Review"** from the command palette or editor title bar.

Run through the checklist from the spec:

1. Verify resolved threads render with a muted "✓" bubble; unresolved render with avatar bubble.
2. Click a resolved bubble → thread opens with "✓ Resolved conversation" banner and "Unresolve" button.
3. Click "Unresolve" → confirm GitHub.com shows the thread as unresolved. Bubble returns to normal avatar style.
4. Click an unresolved bubble → thread opens with "Resolve conversation" button in footer.
5. Click "Resolve conversation" → confirm GitHub.com shows the thread as resolved. Bubble changes to muted "✓".
6. Hover over own comment → ⋯ button appears. Hover over another user's comment → no ⋯ button.
7. Click ⋯ → "Edit" and "Delete" appear.
8. Click "Edit" → textarea pre-filled with existing text. Edit it, click "Update comment" → body updates; verify on GitHub.com.
9. Click "Cancel" on edit → original text restored, no API call.
10. Click ⋯ → "Delete" → inline confirm appears. Click "Delete" → comment removed; verify on GitHub.com.
11. Delete the last comment in a single-comment thread → thread panel and bubble disappear entirely.
12. Simulate a network failure (toggle wifi off) during resolve → "Action failed" toast appears, bubble state unchanged.
13. Disconnect before `fetchThreadMeta` (turn off network before running the command) → threads load without resolve buttons, no crash.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test: fixture branch note — keep open through Phase 4"
```

---

## Summary of Changes

| File | Type | What changed |
|------|------|-------------|
| `src/types.ts` | Modified | `ThreadMeta`, `node_id` on `PRComment`, 4 new message types each direction |
| `src/GitHubClient.ts` | Modified | `githubGraphQL`, `fetchThreadMeta`, `editComment`, `deleteComment`, `resolveThread`, `unresolveThread`; 204 support in `githubRequest`; `node_id` in `mapComment` |
| `src/extension.ts` | Modified | Calls `fetchThreadMeta`, passes result to `render` |
| `src/ReviewPanel.ts` | Modified | `threadMeta` in render message, 4 new message handlers, `source` field on errors, CSS for new elements |
| `webview/thread.ts` | Modified | Options object refactor, ⋯ menu, edit/delete in-place, resolve/unresolve button, resolved banner |
| `webview/overlay.ts` | Modified | `threadMeta` + `OverlayCallbacks` parameters, resolved bubble style |
| `webview/main.ts` | Modified | `allThreadMeta` state, `buildCallbacks()`, 4 new message handlers |
