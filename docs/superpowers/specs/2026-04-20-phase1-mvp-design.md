# Phase 1 MVP Design — Markdown PR Review

**Date:** 2026-04-20
**Scope:** Phase 1 read-only MVP. User views GitHub PR review comments overlaid on a rendered markdown webview.

---

## Goal

Open a markdown file while on a PR branch, run a command, and see all PR review comments anchored visually to the lines they were left on — rendered markdown, not raw source.

---

## User Flow

1. User checks out the PR branch in their workspace.
2. Opens a markdown file in the editor.
3. Runs command **"Open PR Review"** from the command palette.
4. VS Code prompts GitHub sign-in if not already authenticated.
5. A webview panel opens beside the editor showing the rendered markdown with comment bubbles anchored to the commented lines.
6. User clicks a bubble to expand the full thread inline.

---

## Implementation Approach

**Vertical slice first.** Build a thin end-to-end path with mock data (hardcoded markdown + fake comment bubbles) so the overlay renders correctly. Then replace the mock with real GitHub API data and real markdown rendering. This keeps something visual working at every stage.

---

## Architecture

Two runtime contexts communicate via VS Code message passing.

### Extension Host (Node.js)

| File | Responsibility |
|------|---------------|
| `src/extension.ts` | Activation, command registration |
| `src/GitContext.ts` | Reads branch name and remote URL from workspace git |
| `src/GitHubClient.ts` | GitHub auth + API calls |
| `src/ReviewPanel.ts` | Owns the WebviewPanel, sends data to webview, handles inbound messages |

### Webview (sandboxed browser, bundled separately)

| File | Responsibility |
|------|---------------|
| `webview/main.ts` | Entry point — receives render message, orchestrates pipeline |
| `webview/renderer.ts` | markdown-it with source-map, emits `data-line` attributes |
| `webview/overlay.ts` | Positions comment bubbles using `data-line` → `getBoundingClientRect` |
| `webview/thread.ts` | Thread expansion — click bubble to show full thread |

---

## Message Protocol

**Extension → webview:**
```typescript
{
  type: 'render';
  markdown: string;
  comments: PRComment[];
  filePath: string;
}
```

**Webview → extension:**
```typescript
{ type: 'ready' }
```

---

## GitHub API Flow

When the command runs:

1. Parse `owner/repo` from the workspace git remote URL.
2. Read the current branch name via `git rev-parse --abbrev-ref HEAD`.
3. Obtain a GitHub token via `vscode.authentication.getSession('github', ['repo'])` — VS Code prompts sign-in if needed.
4. `GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open` — find the PR number for the current branch.
5. `GET /repos/{owner}/{repo}/pulls/{number}/comments` — fetch all review comments.
6. Filter to comments where `comment.path` matches the current file path relative to the repo root.
7. Pass `commit_id` (head SHA) when resolving positions so line anchors stay stable even if the file has changed locally.

---

## Data Model

```typescript
interface PRComment {
  id: number;
  in_reply_to_id?: number;  // present on replies; used for thread grouping
  line: number;             // line number in the file at head SHA
  body: string;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
}
```

Thread grouping is done client-side: comments sharing the same root `id` / `in_reply_to_id` chain are a single thread. The bubble shows the first comment's author avatar; clicking expands all replies.

---

## Webview Rendering Pipeline

The webview executes this sequence on receiving a `render` message:

1. **markdown-it render** — `renderer.ts` renders the markdown string with source-map enabled. Every block element gets a `data-line="N"` attribute reflecting its source line number.
2. **Mermaid** — fenced code blocks with `language-mermaid` are swapped for `.mermaid` divs. `mermaid.run()` is called and awaited before overlay placement.
3. **Overlay placement** — `overlay.ts` iterates `comments`. For each comment at line N, it finds the DOM element where `data-line` is closest to (≤) N, then positions a bubble absolutely using `getBoundingClientRect`. Bubbles are positioned relative to the webview scroll container.
4. **Thread UI** — `thread.ts` attaches click handlers to bubbles. Clicking a bubble renders the full thread (author, timestamp, body rendered as markdown) in a panel that appears below the bubble.

---

## Mermaid Handling

- Mermaid renders asynchronously. Overlay placement **must wait** for `mermaid.run()` to resolve or bubbles land on placeholder `<pre>` elements.
- Comment granularity for Mermaid diagrams: **per fenced block** (MVP). The comment anchors to the fence's opening line, matching GitHub's own anchor behaviour.
- Theme: check whether `document.body.classList.contains('vscode-dark')` and pass `theme: 'dark'` or `theme: 'default'` to `mermaid.initialize`. VS Code sets `vscode-dark`, `vscode-light`, or `vscode-high-contrast` on the webview body.

---

## Toolchain

| Tool | Choice | Reason |
|------|--------|--------|
| Language | TypeScript strict | Type safety, VS Code API types |
| Bundler | esbuild | Simpler config than webpack; two targets (extension host + webview) |
| GitHub API client | Raw `fetch` via `@octokit/request` | Lightweight, typed, no large runtime dep |
| Tests | None in Phase 1 | Manual testing against this repo's own PRs |

---

## Out of Scope (Phase 1)

- Adding new comments
- Replying to or resolving threads
- Multi-file PR review
- Scroll sync with source editor
- Keyboard navigation
- PAT fallback authentication (built-in GitHub auth only)

---

## Test Strategy

Use this repository itself as the test case:

1. Create a PR against `main` with review comments left on `docs/ARCHITECTURE.md` and/or `README.md`.
2. Check out the PR branch locally.
3. Open one of the commented files and run the command.
4. Verify bubbles appear at the correct lines, click to expand threads, Mermaid diagrams render with theme matching.
