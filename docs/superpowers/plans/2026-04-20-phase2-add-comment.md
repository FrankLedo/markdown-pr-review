# Phase 2 Add-Comment UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to add new PR review comments, replies, and draft reviews directly from the rendered markdown webview.

**Architecture:** Compose UI lives entirely in the webview (`compose.ts`, `draft.ts`). The webview fires typed messages to the extension host; `ReviewPanel.ts` handles them by calling new GitHub write functions and sending results back. Draft comment data accumulates in the extension host (for the API call); count is tracked locally in the webview for the badge. Optimistic UI pushes a temp comment into `allComments`, calls `placeOverlays`, then replaces or removes it on server response.

**Tech Stack:** TypeScript strict, VS Code Webview message API, GitHub REST API (`POST /repos/{owner}/{repo}/pulls/{number}/comments`, `POST /repos/{owner}/{repo}/pulls/{number}/reviews`), existing esbuild + markdown-it pipeline. No new npm dependencies.

---

## File Map

**Created:**
- `webview/compose.ts` — creates compose box DOM elements; accepts callbacks so `main.ts` owns business logic
- `webview/draft.ts` — `DraftManager` class; tracks pending count, renders header badge, fires `submitReview`

**Modified:**
- `src/types.ts` — add `WebviewMessage` and `ExtensionMessage` union types; add `headSha`/`currentUserLogin` to `RenderMessage`
- `src/GitHubClient.ts` — `getGitHubToken` returns `{ token, userLogin }`; `findPrNumber` returns `{ prNumber, headSha }`; rename `githubGet`→`githubRequest` (POST support); add `postComment`, `postReply`, `submitDraftReview`
- `src/extension.ts` — destructure new return values; pass `headSha`/`currentUserLogin` to `panel.render()`
- `src/ReviewPanel.ts` — add instance fields for PR context; expand `render()` signature; add `onDidReceiveMessage` handler; draft warning on dispose; updated HTML/CSS
- `webview/overlay.ts` — export `findAnchorElement`; `placeOverlays` accepts `onReply`; add `initSelectionHandlers` (floating button + context menu)
- `webview/thread.ts` — `toggleThread` accepts `onReply` callback; renders Reply button
- `webview/main.ts` — stores `allComments`/`currentUserLogin`/`draft`; mounts `DraftManager`; wires `initSelectionHandlers`; handles all new inbound message types

---

### Task 1: Extend `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Replace `src/types.ts`**

```typescript
export interface PRComment {
  id: number;
  in_reply_to_id?: number;
  line: number;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}

export interface RenderMessage {
  type: 'render';
  markdown: string;
  comments: PRComment[];
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
  | { type: 'submitReview' };

// Messages sent from the extension host to the webview
export type ExtensionMessage =
  | RenderMessage
  | { type: 'commentPosted'; comment: PRComment; tempId: number }
  | { type: 'replyPosted'; comment: PRComment; tempId: number }
  | { type: 'reviewSubmitted'; comments: PRComment[] }
  | { type: 'postError'; message: string; tempId?: number };
```

- [ ] **Step 2: Build to confirm no type errors introduced yet**

```bash
npm run compile
```

Expected: errors in `extension.ts` and `ReviewPanel.ts` because `render()` signature hasn't changed yet — those are fine. No errors in `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: extend message protocol types for Phase 2"
```

---

### Task 2: Update `src/GitHubClient.ts`

**Files:**
- Modify: `src/GitHubClient.ts`

Changes: `getGitHubToken` returns `{ token, userLogin }`; `findPrNumber` returns `{ prNumber, headSha }`; rename `githubGet`→`githubRequest` with POST support; add `postComment`, `postReply`, `submitDraftReview`.

- [ ] **Step 1: Replace `src/GitHubClient.ts`**

```typescript
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
```

- [ ] **Step 2: Build**

```bash
npm run compile
```

Expected: errors in `extension.ts` (uses old `getGitHubToken` and `findPrNumber` signatures). Fix in next task.

- [ ] **Step 3: Commit**

```bash
git add src/GitHubClient.ts
git commit -m "feat: add GitHub write functions — postComment, postReply, submitDraftReview"
```

---

### Task 3: Update `src/extension.ts`

**Files:**
- Modify: `src/extension.ts`

Destructure new return values from `getGitHubToken` and `findPrNumber`; pass `headSha`/`currentUserLogin` to `panel.render()`.

- [ ] **Step 1: Replace `src/extension.ts`**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewPanel } from './ReviewPanel';
import { getGitContext } from './GitContext';
import { getGitHubToken, findPrNumber, fetchPrComments } from './GitHubClient';

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
            const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

            const { token, userLogin } = await getGitHubToken();
            const { prNumber, headSha } = await findPrNumber(owner, repo, branch, token);
            const comments = await fetchPrComments(owner, repo, prNumber, relPath, token);

            const panel = ReviewPanel.createOrShow(context.extensionUri);
            panel.render(markdown, comments, {
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

- [ ] **Step 2: Build**

```bash
npm run compile
```

Expected: errors in `ReviewPanel.ts` because `render()` hasn't been updated yet. Fix in next task.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: pass headSha and userLogin from extension command to ReviewPanel"
```

---

### Task 4: Replace `src/ReviewPanel.ts`

**Files:**
- Modify: `src/ReviewPanel.ts`

This is the largest extension-host change. Adds: PR context instance fields, expanded `render()` signature, `onDidReceiveMessage` handler for four new message types, draft warning on dispose, updated HTML with `#review-header` div and new CSS for compose/draft/buttons.

- [ ] **Step 1: Replace `src/ReviewPanel.ts`**

```typescript
import * as vscode from 'vscode';
import type { PRComment, WebviewMessage } from './types';
import { postComment, postReply, submitDraftReview, getGitHubToken } from './GitHubClient';

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export interface PrContext {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  filePath: string;
  currentUserLogin: string;
}

export class ReviewPanel {
  static currentPanel: ReviewPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];

  private _owner = '';
  private _repo = '';
  private _prNumber = 0;
  private _headSha = '';
  private _filePath = '';
  private _draftComments: Array<{ line: number; body: string }> = [];

  static createOrShow(extensionUri: vscode.Uri): ReviewPanel {
    const column = vscode.ViewColumn.Beside;
    if (ReviewPanel.currentPanel) {
      ReviewPanel.currentPanel._panel.reveal(column);
      return ReviewPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      'markdownPrReview',
      'PR Review',
      column,
      {
        enableScripts: true,
        enableFindWidget: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      }
    );
    ReviewPanel.currentPanel = new ReviewPanel(panel, extensionUri);
    return ReviewPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.webview.html = this._buildHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => { this._handleMessage(msg).catch(console.error); },
      null,
      this._disposables
    );
  }

  render(markdown: string, comments: PRComment[], ctx: PrContext): void {
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
      filePath: ctx.filePath,
      headSha: ctx.headSha,
      currentUserLogin: ctx.currentUserLogin,
    });
  }

  private async _handleMessage(msg: WebviewMessage): Promise<void> {
    if (msg.type === 'ready') return;

    const tempId = (msg as { tempId?: number }).tempId;

    try {
      const { token } = await getGitHubToken();

      if (msg.type === 'postComment') {
        const comment = await postComment(
          this._owner, this._repo, this._prNumber, token,
          { body: msg.body, commitId: this._headSha, path: this._filePath, line: msg.line }
        );
        this._panel.webview.postMessage({ type: 'commentPosted', comment, tempId: msg.tempId });

      } else if (msg.type === 'postReply') {
        const comment = await postReply(
          this._owner, this._repo, this._prNumber, token,
          { body: msg.body, inReplyToId: msg.inReplyToId }
        );
        this._panel.webview.postMessage({ type: 'replyPosted', comment, tempId: msg.tempId });

      } else if (msg.type === 'addToDraft') {
        this._draftComments.push({ line: msg.line, body: msg.body });

      } else if (msg.type === 'submitReview') {
        const comments = await submitDraftReview(
          this._owner, this._repo, this._prNumber, token,
          {
            commitId: this._headSha,
            comments: this._draftComments.map(c => ({
              path: this._filePath,
              line: c.line,
              body: c.body,
            })),
          }
        );
        this._draftComments = [];
        this._panel.webview.postMessage({ type: 'reviewSubmitted', comments });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage({ type: 'postError', message, tempId });
    }
  }

  dispose(): void {
    if (this._draftComments.length > 0) {
      const n = this._draftComments.length;
      vscode.window.showWarningMessage(
        `You have ${n} pending draft comment${n > 1 ? 's' : ''} that will be lost.`
      );
    }
    ReviewPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }

  private _buildHtml(): string {
    const webview = this._panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
    );
    const mermaidUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'mermaid.min.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PR Review</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 0;
      line-height: 1.6;
    }
    #review-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      padding: 6px 20px;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }
    #review-header:empty { display: none; }
    #content { max-width: 800px; margin: 0 auto; padding: 20px; }
    .pr-bubble {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      border-radius: 10px;
      padding: 2px 7px 2px 4px;
      cursor: pointer;
      float: right;
      font-size: 11px;
      line-height: 1;
      height: 20px;
      box-sizing: border-box;
      margin-left: 8px;
      vertical-align: middle;
    }
    .pr-bubble:hover { opacity: 0.85; }
    .pr-bubble-avatar {
      width: 14px; height: 14px; min-width: 14px;
      border-radius: 50%; object-fit: cover; display: block;
    }
    .pr-thread {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
      border-left: 3px solid var(--vscode-focusBorder, #007acc);
      padding: 8px 12px;
      margin: 6px 0;
      border-radius: 0 4px 4px 0;
      clear: both;
    }
    .pr-thread-item + .pr-thread-item {
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      margin-top: 8px;
      padding-top: 8px;
    }
    .pr-thread-header {
      display: flex; align-items: center; gap: 6px;
      margin-bottom: 4px; font-size: 12px; opacity: 0.8;
    }
    .pr-thread-avatar { width: 20px; height: 20px; border-radius: 50%; }
    .pr-thread-body { font-size: 13px; word-break: break-word; }
    .pr-thread-body p { margin: 0.3em 0; }
    .pr-thread-body p:first-child { margin-top: 0; }
    .pr-thread-body p:last-child { margin-bottom: 0; }
    .pr-thread-body code { background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.1)); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .pr-thread-body pre { background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.1)); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 0.4em 0; }
    .pr-thread-body pre code { background: none; padding: 0; }
    .pr-thread-footer { margin-top: 8px; }
    .pr-reply-btn {
      background: none;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.2));
      color: var(--vscode-editor-foreground);
      padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
    }
    .pr-reply-btn:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
    .mermaid { margin: 1em 0; }
    .pr-add-btn {
      position: fixed;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: none; border-radius: 4px;
      padding: 4px 10px; font-size: 12px; cursor: pointer;
      z-index: 200; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .pr-add-btn:hover { opacity: 0.9; }
    .pr-context-menu {
      position: fixed;
      background: var(--vscode-menu-background, #2d2d2d);
      border: 1px solid var(--vscode-menu-border, rgba(255,255,255,0.2));
      border-radius: 4px; padding: 4px 0;
      z-index: 300; min-width: 140px; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .pr-context-item {
      padding: 6px 14px; font-size: 13px; cursor: pointer;
    }
    .pr-context-item:hover {
      background: var(--vscode-menu-selectionBackground, #094771);
      color: var(--vscode-menu-selectionForeground, #fff);
    }
    .pr-compose {
      border: 1px solid var(--vscode-focusBorder, #007acc);
      border-radius: 4px; padding: 8px; margin: 6px 0;
      background: var(--vscode-input-background, rgba(255,255,255,0.05));
      clear: both;
    }
    .pr-compose textarea {
      width: 100%; min-height: 72px;
      background: var(--vscode-input-background, transparent);
      color: var(--vscode-input-foreground, inherit);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2));
      border-radius: 3px; padding: 6px;
      font-family: var(--vscode-font-family); font-size: 13px;
      resize: vertical; box-sizing: border-box;
    }
    .pr-compose textarea:focus { outline: 1px solid var(--vscode-focusBorder, #007acc); }
    .pr-compose-actions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
    .pr-compose-actions button {
      padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; border: none;
    }
    .pr-btn-primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .pr-btn-primary:hover { opacity: 0.9; }
    .pr-btn-primary:disabled { opacity: 0.5; cursor: default; }
    .pr-btn-secondary {
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
      color: var(--vscode-button-secondaryForeground, inherit);
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.2)) !important;
    }
    .pr-btn-secondary:hover { opacity: 0.9; }
    .pr-btn-secondary:disabled { opacity: 0.5; cursor: default; }
    .pr-compose-error { color: var(--vscode-errorForeground, #f48771); font-size: 12px; margin-top: 4px; display: none; }
    .pr-draft-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      border-radius: 12px; padding: 4px 12px; font-size: 12px;
    }
    .pr-draft-submit {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: none; border-radius: 4px; padding: 3px 10px; font-size: 12px; cursor: pointer;
    }
    .pr-draft-submit:hover { opacity: 0.9; }
    .pr-draft-error { color: var(--vscode-errorForeground, #f48771); font-size: 12px; margin-left: 8px; display: none; }
    .pr-toast {
      position: fixed; bottom: 20px; right: 20px;
      background: var(--vscode-errorForeground, #f48771); color: #fff;
      padding: 8px 16px; border-radius: 4px; font-size: 13px;
      z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div id="review-header"></div>
  <div id="content"><p>Loading&#x2026;</p></div>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
```

- [ ] **Step 2: Build**

```bash
npm run compile
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ReviewPanel.ts
git commit -m "feat: ReviewPanel stores PR context, handles write messages, adds compose CSS"
```

---

### Task 5: Create `webview/compose.ts`

**Files:**
- Create: `webview/compose.ts`

Creates and returns a compose box DOM element. The caller is responsible for inserting it into the DOM. `showComposeError` restores the disabled state and shows an inline error message.

- [ ] **Step 1: Create `webview/compose.ts`**

```typescript
export interface ComposeCallbacks {
  hasDraft: () => boolean;
  onPostImmediately: (body: string) => void;
  onAddToDraft: (body: string) => void;
  onCancel: () => void;
}

export function createComposeBox(callbacks: ComposeCallbacks): HTMLElement {
  const box = document.createElement('div');
  box.className = 'pr-compose';

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Leave a comment…';

  const actions = document.createElement('div');
  actions.className = 'pr-compose-actions';

  const postBtn = document.createElement('button');
  postBtn.className = 'pr-btn-primary';
  postBtn.textContent = 'Post comment';

  const draftBtn = document.createElement('button');
  draftBtn.className = 'pr-btn-secondary';
  draftBtn.textContent = callbacks.hasDraft() ? 'Add to review' : 'Start review';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pr-btn-secondary';
  cancelBtn.textContent = 'Cancel';

  const errorEl = document.createElement('div');
  errorEl.className = 'pr-compose-error';

  postBtn.addEventListener('click', () => {
    const body = textarea.value.trim();
    if (!body) return;
    textarea.disabled = true;
    postBtn.disabled = true;
    draftBtn.disabled = true;
    postBtn.textContent = 'Posting…';
    errorEl.style.display = 'none';
    callbacks.onPostImmediately(body);
  });

  draftBtn.addEventListener('click', () => {
    const body = textarea.value.trim();
    if (!body) return;
    callbacks.onAddToDraft(body);
    box.remove();
  });

  cancelBtn.addEventListener('click', () => {
    callbacks.onCancel();
    box.remove();
  });

  actions.appendChild(postBtn);
  actions.appendChild(draftBtn);
  actions.appendChild(cancelBtn);
  box.appendChild(textarea);
  box.appendChild(actions);
  box.appendChild(errorEl);

  // Focus textarea on next tick so the element is in the DOM
  setTimeout(() => textarea.focus(), 0);
  return box;
}

export function showComposeError(box: HTMLElement, message: string): void {
  const textarea = box.querySelector('textarea') as HTMLTextAreaElement | null;
  const postBtn = box.querySelector('.pr-btn-primary') as HTMLButtonElement | null;
  const draftBtn = box.querySelector('.pr-btn-secondary') as HTMLButtonElement | null;
  const errorEl = box.querySelector('.pr-compose-error') as HTMLElement | null;
  if (textarea) textarea.disabled = false;
  if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'Post comment'; }
  if (draftBtn) draftBtn.disabled = false;
  if (errorEl) { errorEl.textContent = message; errorEl.style.display = 'block'; }
}
```

- [ ] **Step 2: Build**

```bash
npm run compile
```

Expected: no errors (not yet imported).

- [ ] **Step 3: Commit**

```bash
git add webview/compose.ts
git commit -m "feat: add compose box component"
```

---

### Task 6: Create `webview/draft.ts`

**Files:**
- Create: `webview/draft.ts`

Tracks pending draft comment count, renders/updates the sticky header badge, and fires `submitReview` to the extension host.

- [ ] **Step 1: Create `webview/draft.ts`**

```typescript
export class DraftManager {
  private _count = 0;
  private readonly _vscode: { postMessage(msg: unknown): void };
  private readonly _header: HTMLElement;
  private _badgeEl: HTMLElement | null = null;
  private _errorEl: HTMLSpanElement | null = null;

  constructor(vscode: { postMessage(msg: unknown): void }, header: HTMLElement) {
    this._vscode = vscode;
    this._header = header;
  }

  get count(): number {
    return this._count;
  }

  add(line: number, body: string): void {
    this._count++;
    this._vscode.postMessage({ type: 'addToDraft', line, body });
    this._render();
  }

  clear(): void {
    this._count = 0;
    this._badgeEl?.remove();
    this._badgeEl = null;
    this._errorEl = null;
  }

  showError(message: string): void {
    if (this._errorEl) {
      this._errorEl.textContent = message;
      this._errorEl.style.display = 'inline';
    }
  }

  private _render(): void {
    if (!this._badgeEl) {
      const badge = document.createElement('div');
      badge.className = 'pr-draft-badge';

      const label = document.createElement('span');
      label.className = 'pr-draft-label';

      const submitBtn = document.createElement('button');
      submitBtn.className = 'pr-draft-submit';
      submitBtn.addEventListener('click', () => {
        if (this._errorEl) this._errorEl.style.display = 'none';
        this._vscode.postMessage({ type: 'submitReview' });
      });

      const errorEl = document.createElement('span');
      errorEl.className = 'pr-draft-error';

      badge.appendChild(label);
      badge.appendChild(submitBtn);
      badge.appendChild(errorEl);
      this._header.appendChild(badge);
      this._badgeEl = badge;
      this._errorEl = errorEl;
    }

    const label = this._badgeEl.querySelector('.pr-draft-label') as HTMLElement;
    const submitBtn = this._badgeEl.querySelector('.pr-draft-submit') as HTMLElement;
    label.textContent = `${this._count} pending comment${this._count !== 1 ? 's' : ''}`;
    submitBtn.textContent = `Submit review (${this._count})`;
  }
}
```

- [ ] **Step 2: Build**

```bash
npm run compile
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add webview/draft.ts
git commit -m "feat: add DraftManager for pending review comments"
```

---

### Task 7: Update `webview/overlay.ts`

**Files:**
- Modify: `webview/overlay.ts`

Key changes:
- `findAnchorElement` is now exported (used by `main.ts`)
- `placeOverlays` accepts optional `onReply` callback, passes it to `createBubble` → `toggleThread`
- Add `initSelectionHandlers`: floating "Add comment" button on `mouseup`, custom context menu on right-click
- Add `resolveSelectionAnchor` helper (private)

- [ ] **Step 1: Replace `webview/overlay.ts`**

```typescript
import type { PRComment } from '../src/types';
import { toggleThread, type OnReply } from './thread';

interface Thread {
  rootId: number;
  line: number;
  comments: PRComment[];
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
    if (elLine <= line && elLine > bestLine) {
      best = el;
      bestLine = elLine;
    }
  }
  return best;
}

function createBubble(thread: Thread, onReply?: OnReply): HTMLElement {
  const bubble = document.createElement('span');
  bubble.className = 'pr-bubble';
  bubble.title = `${thread.comments[0].user.login}: ${thread.comments[0].body.slice(0, 80)}`;

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

  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleThread(bubble, thread.comments, thread.rootId, onReply);
  });

  return bubble;
}

export function placeOverlays(
  container: HTMLElement,
  comments: PRComment[],
  onReply?: OnReply
): void {
  container.querySelectorAll('.pr-bubble, .pr-thread').forEach(el => el.remove());
  if (comments.length === 0) return;
  const threads = buildThreads(comments);
  for (const thread of threads) {
    const anchor = findAnchorElement(container, thread.line);
    if (!anchor) continue;
    const bubble = createBubble(thread, onReply);
    anchor.appendChild(bubble);
  }
}

// Resolves the nearest data-line ancestor of the current selection start.
// Returns null if the selection is empty or no data-line ancestor is found.
function resolveSelectionAnchor(
  container: HTMLElement
): { anchor: HTMLElement; line: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
  if (!el) return null;

  // Walk up to find a data-line ancestor
  let candidate: HTMLElement | null = el;
  while (candidate && candidate !== container) {
    if (candidate.dataset['line']) {
      return { anchor: candidate, line: parseInt(candidate.dataset['line'], 10) };
    }
    candidate = candidate.parentElement;
  }

  // Fallback: last data-line element whose top edge is above the selection start
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
    // Position will be adjusted after append; use placeholder values first
    btn.style.left = '0px';
    btn.style.top = `${rect.top + window.scrollY - 34}px`;

    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
    btn.addEventListener('click', () => {
      removeFloatBtn();
      onAddComment(resolved.anchor, resolved.line);
      window.getSelection()?.removeAllRanges();
    });

    document.body.appendChild(btn);
    // Adjust left after append so offsetWidth is known
    btn.style.left = `${rect.right - btn.offsetWidth}px`;
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
    // Delay to avoid the current click immediately dismissing the menu
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  });
}
```

- [ ] **Step 2: Build**

```bash
npm run compile
```

Expected: error in `thread.ts` — `OnReply` not yet exported from there. Fix in next task.

- [ ] **Step 3: Commit after thread.ts is updated (do Task 8 first, then come back to commit both)**

---

### Task 8: Update `webview/thread.ts`

**Files:**
- Modify: `webview/thread.ts`

Export `OnReply` type. `toggleThread` accepts an optional `onReply` callback. When `onReply` is provided, render a Reply button at the bottom of the thread panel that calls `onReply(panel, rootId, rootLine)`.

- [ ] **Step 1: Replace `webview/thread.ts`**

```typescript
import type { PRComment } from '../src/types';
import { renderMarkdown } from './renderer';

export type OnReply = (panel: HTMLElement, rootId: number, line: number) => void;

export function toggleThread(
  bubble: HTMLElement,
  comments: PRComment[],
  threadId: number,
  onReply?: OnReply
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
    panel.appendChild(item);
  }

  if (onReply) {
    const footer = document.createElement('div');
    footer.className = 'pr-thread-footer';

    const replyBtn = document.createElement('button');
    replyBtn.className = 'pr-reply-btn';
    replyBtn.textContent = 'Reply';

    replyBtn.addEventListener('click', () => {
      const rootComment = comments.find(c => !c.in_reply_to_id) ?? comments[0];
      onReply(panel, rootComment.id, rootComment.line);
    });

    footer.appendChild(replyBtn);
    panel.appendChild(footer);
  }

  parent.insertAdjacentElement('afterend', panel);
}
```

- [ ] **Step 2: Build**

```bash
npm run compile
```

Expected: no errors.

- [ ] **Step 3: Commit overlay.ts and thread.ts together**

```bash
git add webview/overlay.ts webview/thread.ts
git commit -m "feat: add selection handlers, floating button, context menu, Reply button"
```

---

### Task 9: Replace `webview/main.ts`

**Files:**
- Modify: `webview/main.ts`

This is the final wiring task. `main.ts` now:
- Stores `allComments`, `currentUserLogin`, `draft`
- Guards `initSelectionHandlers` so it's only called once
- Defines `onAddComment` and `onReply` callbacks that create and insert compose boxes
- Handles `commentPosted`, `replyPosted`, `reviewSubmitted`, `postError` messages
- Shows a toast on post errors (compose box may be gone after `placeOverlays` re-render)

- [ ] **Step 1: Replace `webview/main.ts`**

```typescript
import { renderMarkdown } from './renderer';
import { placeOverlays, initSelectionHandlers, findAnchorElement } from './overlay';
import type { OnReply } from './thread';
import { createComposeBox } from './compose';
import { DraftManager } from './draft';
import type { ExtensionMessage, PRComment, RenderMessage } from '../src/types';

declare const mermaid: {
  initialize(opts: object): void;
  run(opts: { nodes: NodeList | HTMLElement[] }): Promise<void>;
};

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

let allComments: PRComment[] = [];
let currentUserLogin = '';
let draft!: DraftManager; // assigned in handleRender before any user interaction
let contentEl: HTMLElement | null = null;
let selectionHandlersReady = false;

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'pr-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

const onReply: OnReply = (panel, rootId, line) => {
  panel.querySelector('.pr-compose')?.remove();
  const box = createComposeBox({
    hasDraft: () => draft.count > 0,
    onPostImmediately: (body) => {
      const tempId = -Date.now();
      allComments.push({
        id: tempId,
        in_reply_to_id: rootId,
        line,
        body,
        user: { login: currentUserLogin, avatar_url: '' },
        created_at: new Date().toISOString(),
      });
      box.remove();
      placeOverlays(contentEl!, allComments, onReply);
      vscode.postMessage({ type: 'postReply', inReplyToId: rootId, line, body, tempId });
    },
    onAddToDraft: (body) => { draft.add(line, body); },
    onCancel: () => {},
  });
  panel.appendChild(box);
};

function onAddComment(anchor: HTMLElement, line: number): void {
  // Remove any existing compose box immediately after this anchor
  const next = anchor.nextElementSibling;
  if (next?.classList.contains('pr-compose')) next.remove();

  const box = createComposeBox({
    hasDraft: () => draft.count > 0,
    onPostImmediately: (body) => {
      const tempId = -Date.now();
      allComments.push({
        id: tempId,
        line,
        body,
        user: { login: currentUserLogin, avatar_url: '' },
        created_at: new Date().toISOString(),
      });
      box.remove();
      placeOverlays(contentEl!, allComments, onReply);
      vscode.postMessage({ type: 'postComment', line, body, tempId });
    },
    onAddToDraft: (body) => { draft.add(line, body); },
    onCancel: () => {},
  });
  anchor.insertAdjacentElement('afterend', box);
}

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  if (msg.type === 'render') {
    handleRender(msg).catch(console.error);
    return;
  }

  if (msg.type === 'commentPosted' || msg.type === 'replyPosted') {
    allComments = allComments.map(c => c.id === msg.tempId ? msg.comment : c);
    placeOverlays(contentEl!, allComments, onReply);
    return;
  }

  if (msg.type === 'reviewSubmitted') {
    allComments = [...allComments, ...msg.comments];
    draft.clear();
    placeOverlays(contentEl!, allComments, onReply);
    return;
  }

  if (msg.type === 'postError') {
    if (msg.tempId != null) {
      allComments = allComments.filter(c => c.id !== msg.tempId);
      placeOverlays(contentEl!, allComments, onReply);
      showToast(`Failed to post — ${msg.message}`);
    } else {
      draft.showError(`Submit failed — ${msg.message}`);
    }
  }
});

async function handleRender(msg: RenderMessage): Promise<void> {
  contentEl = document.getElementById('content');
  if (!contentEl) return;

  currentUserLogin = msg.currentUserLogin;
  allComments = [...msg.comments];

  contentEl.innerHTML = renderMarkdown(msg.markdown);

  const isDark =
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast');

  mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });

  const mermaidNodes = contentEl.querySelectorAll<HTMLElement>('.mermaid');
  if (mermaidNodes.length > 0) {
    await mermaid.run({ nodes: mermaidNodes });
  }

  placeOverlays(contentEl, allComments, onReply);

  const header = document.getElementById('review-header')!;
  draft = new DraftManager(vscode, header);

  if (!selectionHandlersReady) {
    initSelectionHandlers(contentEl, onAddComment);
    selectionHandlersReady = true;
  }
}
```

- [ ] **Step 2: Build**

```bash
npm run compile
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add webview/main.ts
git commit -m "feat: wire compose, draft, and message handlers in main.ts"
```

---

### Task 10: Build and manually test

**Files:** none

- [ ] **Step 1: Run a full production build**

```bash
npm run compile
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 2: Open the Extension Development Host**

In VS Code, press `F5` (or run the "Extension Development Host" launch config). A new VS Code window opens with the extension loaded.

- [ ] **Step 3: Test — select text and add a comment immediately**

1. In the Extension Development Host, open a markdown file that has an open PR with existing comments.
2. Run "Open PR Review" from the command palette.
3. In the webview, select some text in a paragraph.
4. Verify the floating "+ Add comment" button appears at the top-right of the selection.
5. Click it. Verify the compose box appears below the selected paragraph.
6. Type a comment and click "Post comment".
7. Verify the button shows "Posting…" and is disabled.
8. Verify the comment appears in the GitHub PR (check the PR on github.com).
9. Verify the bubble for that line updates in the webview.

- [ ] **Step 4: Test — right-click context menu**

1. Select text in the webview.
2. Right-click. Verify a context menu appears with "+ Add comment".
3. Click it. Verify the compose box opens.
4. Click Cancel. Verify the box disappears.

- [ ] **Step 5: Test — add to draft review**

1. Select text, open compose box, click "Start review".
2. Verify the compose box closes and the "Submit review (1)" badge appears in the sticky header.
3. Select different text, open another compose box. Verify the button now reads "Add to review".
4. Add it. Verify badge shows "(2)".
5. Click "Submit review (2)". Verify both comments appear on GitHub and the badge disappears.

- [ ] **Step 6: Test — reply to a thread**

1. Click a bubble to expand a thread.
2. Verify a "Reply" button appears at the bottom of the thread panel.
3. Click Reply. Verify a compose box appears inside the thread.
4. Type a reply and click "Post comment".
5. Verify the reply appears on GitHub as a reply to the correct thread.

- [ ] **Step 7: Test — post failure (error toast)**

1. Disconnect from the network (turn off WiFi or use a proxy blocker).
2. Select text, open compose box, type a comment, click "Post comment".
3. Verify a red toast appears: "Failed to post — …".
4. Verify the optimistic comment bubble was removed.

- [ ] **Step 8: Test — draft warning on panel close**

1. Add a comment to a draft (click "Start review").
2. Close the PR Review panel (click the ✕ on the tab).
3. Verify a VS Code warning notification appears: "You have 1 pending draft comment that will be lost."

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: Phase 2 add-comment UX complete"
```
