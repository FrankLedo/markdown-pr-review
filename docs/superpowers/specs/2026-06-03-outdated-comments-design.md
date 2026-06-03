# Outdated Comment Rendering — Design Spec

**Issue:** #25  
**Date:** 2026-06-03  
**Status:** Approved

---

## Problem

When new commits are pushed to a PR after an inline comment is left, GitHub sets `line: null` on that comment (the diff position is outdated) while still populating `original_line` with the original line number. The extension currently filters these out, so the webview receives no data for them. Thread bubbles still appear (from GraphQL `threadMeta`) but clicking them does nothing.

---

## Goal

Outdated comments should render in the webview, anchored to `original_line`, with a small "Outdated" label so users know the line position may have shifted.

---

## Changes

### `src/types.ts`

Add `outdated?: boolean` to `PRComment`:

```ts
export interface PRComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  line: number;
  outdated?: boolean;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}
```

### `src/GitHubClient.ts`

**1. `GitHubReviewComment` interface** — add `original_line`:

```ts
interface GitHubReviewComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  path: string;
  line: number | null;
  original_line?: number | null;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}
```

**2. `mapComment`** — fall back to `original_line` instead of throwing:

```ts
function mapComment(raw: GitHubReviewComment): PRComment {
  const line = raw.line ?? raw.original_line;
  if (line == null) throw new Error(`mapComment: comment ${raw.id} has no line number`);
  return {
    id: raw.id,
    node_id: raw.node_id,
    in_reply_to_id: raw.in_reply_to_id,
    line,
    outdated: raw.line == null,
    body: raw.body,
    user: { login: raw.user.login, avatar_url: raw.user.avatar_url },
    created_at: raw.created_at,
  };
}
```

**3. `fetchPrComments` filter** — allow comments with `original_line` when `line` is null:

```ts
return raw
  .filter(c => c.path === filePath && (c.line != null || c.original_line != null))
  .map(mapComment);
```

**4. `fetchPrCommentCounts` loop** — count outdated comments so the file picker badge is accurate:

```ts
for (const c of raw) {
  if (c.line != null || c.original_line != null) counts[c.path] = (counts[c.path] ?? 0) + 1;
}
```

### Webview — `webview/thread.ts`

In the thread item header, render a small "Outdated" label when `comment.outdated` is true. Place it after the username/timestamp line, before the body — same position as the resolved banner.

### `src/ReviewPanel.ts` — CSS

Add a style for the outdated label (consistent with `.pr-thread-resolved-banner`):

```css
.pr-thread-outdated-label {
  font-size: 12px;
  color: var(--vscode-gitDecoration-ignoredResourceForeground, #8a8a8a);
  margin-bottom: 4px;
  font-style: italic;
}
```

---

## What Is NOT Changed

- `submitReviewComments` filter (`c.line != null`) — that's for *posting* comments, which require a valid current diff line.
- No GraphQL changes — `threadMeta` already works correctly.
- No changes to comment reply/resolve/delete flows — they use `node_id` and `id`, not `line`.

---

## Testing

1. **Unit test** (`test/GitHubClient-mapComment.test.ts` or similar): verify `mapComment` with `line: null, original_line: 5` returns `{ line: 5, outdated: true }`; verify `line: null, original_line: null` throws; verify `line: 3` returns `{ line: 3, outdated: false }` (or `outdated` absent).
2. **Manual**: push a commit to a PR branch after leaving an inline comment → open the extension → confirm the thread bubble is clickable and the thread body shows "Outdated".
