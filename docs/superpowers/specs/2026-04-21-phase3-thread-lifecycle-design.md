# Phase 3 Design — Thread Lifecycle

**Date:** 2026-04-21
**Scope:** Phase 3. Users can resolve/unresolve threads, edit their own comments, and delete their own comments, all syncing to GitHub.

---

## Goal

Complete the thread interaction lifecycle from the webview: resolve conversations (following GitHub's collapsed-thread model), edit posted comments in-place, and delete comments with a confirm step. All actions sync to GitHub in real time.

---

## Scope

| Feature | In scope |
|---------|----------|
| Resolve / unresolve thread | Yes — via GitHub GraphQL API |
| Edit own comment (in-place) | Yes — via REST PATCH |
| Delete own comment (with confirm) | Yes — via REST DELETE |
| Draft persistence across panel close | No — deferred to a future phase |
| Edit/delete other users' comments | No |
| Multi-file resolve | No |

---

## Design Principle

**Follow the GitHub model.** For all UX decisions in this extension, default to matching GitHub's own patterns. Users already know them. Only deviate with a specific reason. This is a standing rule documented in CLAUDE.md.

---

## User Flow

### Resolve / Unresolve

1. Each expanded thread footer shows a "Resolve conversation" button (next to "Reply").
2. Clicking it calls the GraphQL API. On success the thread collapses: the bubble at the line changes to a muted "✓ Resolved" badge.
3. Clicking a resolved bubble expands the thread with a "Resolved" banner at the top and an "Unresolve" button.
4. Clicking "Unresolve" calls GraphQL and restores the thread to normal state.
5. Threads that are already resolved on GitHub load in collapsed/resolved state on initial render.

### Edit Comment

1. Hovering over a comment item reveals a ⋯ button at the top-right — visible only for the current user's own comments.
2. Clicking ⋯ shows a small dropdown with "Edit" and "Delete".
3. "Edit" replaces the comment body in-place with a textarea pre-filled with the existing text, plus "Update comment" and "Cancel" buttons.
4. Clicking "Update comment" calls REST `PATCH`. On success the body re-renders with the new text. On failure, the original body is restored and an inline error appears.
5. "Cancel" discards the edit with no API call.

### Delete Comment

1. "Delete" in the ⋯ dropdown replaces the comment body with an inline confirm: "Delete this comment? [Delete] [Cancel]" (GitHub's pattern).
2. Confirming calls REST `DELETE`. On success the comment item is removed from the DOM.
3. If the deleted comment was the only one in the thread, the thread panel and bubble are removed entirely.
4. On failure, the confirm prompt dismisses and an inline error appears.

---

## Architecture

### The thread node_id problem

GraphQL's `resolveReviewThread` mutation requires a thread-level `node_id`. GitHub's REST API does not expose thread node_ids directly. Solution: alongside the existing `fetchPrComments` REST call, a new `fetchThreadMeta` GraphQL call returns `{ nodeId, isResolved, rootCommentId }` per thread. The two results are merged in `ReviewPanel` before the `render` message is sent to the webview.

If `fetchThreadMeta` fails, it is treated as non-fatal: threads render without resolve capability, a console warning is logged, and resolve buttons are hidden.

### No new files

All changes fit within existing files.

### Modified extension host files

| File | Change |
|------|--------|
| `src/GitHubClient.ts` | Add `githubGraphQL()` helper; add `fetchThreadMeta()`, `resolveThread()`, `unresolveThread()`, `editComment()`, `deleteComment()` |
| `src/ReviewPanel.ts` | Call `fetchThreadMeta` alongside `fetchPrComments`; include `threadMeta` in render message; handle 4 new inbound message types |
| `src/types.ts` | Add `ThreadMeta` type; extend `PRComment` with `node_id`; add new message types |

### Modified webview files

| File | Change |
|------|--------|
| `webview/thread.ts` | Add ⋯ hover menu per comment (own comments only); resolve/unresolve button in thread footer; collapsed resolved state rendering |
| `webview/main.ts` | Handle 4 new inbound message types: `commentEdited`, `commentDeleted`, `threadResolved`, `threadUnresolved` |

---

## Data Model

```typescript
// New type
interface ThreadMeta {
  nodeId: string;       // GraphQL thread node_id
  isResolved: boolean;  // resolved state from GitHub
  rootCommentId: number; // REST comment id of thread's first comment
}

// PRComment gains one field
interface PRComment {
  // ... existing fields ...
  node_id: string;  // comment's own node_id, returned by REST — needed for PATCH/DELETE
}

// RenderMessage gains one field
interface RenderMessage {
  // ... existing fields ...
  threadMeta: ThreadMeta[];
}
```

---

## Message Protocol Extensions

**Webview → extension (new):**
```typescript
{ type: 'editComment';    commentId: number; body: string }
{ type: 'deleteComment';  commentId: number }
{ type: 'resolveThread';  threadNodeId: string }
{ type: 'unresolveThread'; threadNodeId: string }
```

**Extension → webview (new):**
```typescript
{ type: 'commentEdited';    commentId: number; body: string }
{ type: 'commentDeleted';   commentId: number }
{ type: 'threadResolved';   threadNodeId: string }
{ type: 'threadUnresolved'; threadNodeId: string }
```

Errors reuse the existing `postError` message. No `tempId` is used — edit/delete/resolve wait for API confirmation before updating the DOM (no optimistic updates, since these are destructive or state-changing operations).

---

## GitHub API

### Edit comment (REST)
```
PATCH /repos/{owner}/{repo}/pulls/comments/{comment_id}
{ "body": "updated text" }
```
Returns the updated comment object. Extract `body`, send `commentEdited` to the webview.

### Delete comment (REST)
```
DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}
```
Returns 204. Send `commentDeleted` to the webview.

### Fetch thread metadata (GraphQL)
```graphql
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
```
`id` is the thread `node_id`. `databaseId` on the first comment maps to the REST comment `id`, joining the two datasets.

### Resolve / unresolve (GraphQL)
```graphql
mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}

mutation UnresolveThread($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
```

### GraphQL error handling

GitHub GraphQL always returns HTTP 200. `githubGraphQL()` must inspect `response.errors` and throw if present, so errors surface the same way as REST failures.

---

## Error Handling

- **Edit/delete/resolve failures:** DOM is not updated until the API call succeeds. On failure the UI reverts to its prior state and `postError` is sent with an inline message near the triggering action.
- **`fetchThreadMeta` failure:** Non-fatal. Threads render without resolve capability; resolve buttons are hidden; a console warning is logged.
- **Auth:** Reuses `getGitHubToken()`. If the token is expired, VS Code re-prompts automatically.

---

## Test Fixture

Create a dedicated `test/fixture-comments` branch off `main` with a variety of pre-seeded comment scenarios in `docs/ARCHITECTURE.md`:

- A multi-comment thread (root + 2 replies)
- A thread already resolved on GitHub
- A thread with a comment from the current user (to test edit/delete)
- A single-comment thread (to test delete-last-comment behaviour)

Open a PR from this branch against `main` and record its PR number. **Keep this PR open until all phases (Phase 4) are complete** — reuse it for all manual testing across phases rather than recreating it each time.

---

## Manual Test Checklist

1. Open the fixture PR file — verify resolved threads render collapsed, unresolved render normally.
2. Resolve an unresolved thread → bubble changes to "✓ Resolved"; verify GitHub.com shows it resolved.
3. Unresolve → thread returns to normal on both sides.
4. Hover over own comment → ⋯ menu appears. Hover over another user's comment → ⋯ menu absent.
5. Edit own comment → in-place textarea, saved body renders correctly, GitHub.com reflects the edit.
6. Delete own comment → confirm prompt appears → confirm → comment removed from DOM and GitHub.com.
7. Delete last comment in a thread → thread panel and bubble are removed entirely.
8. Simulate API failure on edit, delete, resolve → DOM reverts, inline error appears.
9. Disconnect network before `fetchThreadMeta` → threads render without resolve buttons; no crash.

---

## Out of Scope (Phase 3)

- Draft review persistence across panel close
- Multi-file resolve
- Editing or deleting other users' comments
- Keyboard navigation for the ⋯ menu
- Reaction emoji on comments
