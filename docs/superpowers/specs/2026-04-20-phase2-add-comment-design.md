# Phase 2 Design — Add-Comment UX

**Date:** 2026-04-20
**Scope:** Phase 2. User can add new PR review comments and replies from the webview, either posting immediately or batching into a draft review.

---

## Goal

From the rendered markdown webview, the user can select text, compose a comment, and post it to the GitHub PR — either immediately as a standalone comment or as part of a draft review submitted all at once.

---

## User Flow

1. User selects text anywhere in the webview.
2. A floating **"Add comment"** button appears at the top-right corner of the selection's bounding rect (so it doesn't obscure the selected text). Right-clicking also shows "Add comment" in the browser context menu.
3. Clicking either opens an inline compose box inserted below the nearest `data-line` element above the selection.
4. The compose box contains:
   - A `<textarea>` for the comment body
   - **"Post comment"** — posts immediately to GitHub
   - **"Start review"** — adds to a pending in-memory draft (button label changes to "Add to review" if a draft is already in progress)
   - **"Cancel"** — removes the compose box
5. While a draft is in progress, a **"Submit review (N)"** badge appears in the webview header showing the pending comment count. Clicking it submits all draft comments in one GitHub API call.
6. Posting immediately closes the compose box and inserts the new comment into the thread optimistically (no reload). If the API call fails, the optimistic entry is removed and an inline error is shown.
7. To reply: click **"Reply"** at the bottom of an expanded thread. A compose box appears inside the thread panel. Same post-immediately / add-to-draft choice.
8. Closing the webview panel while a draft is in progress shows a brief warning: "You have N pending draft comments that will be lost."

---

## Architecture

### New webview files

| File | Responsibility |
|------|---------------|
| `webview/compose.ts` | Renders and manages compose boxes (new comment + reply). Fires outbound messages to the extension host. |
| `webview/draft.ts` | Tracks pending draft comments in memory. Renders and updates the "Submit review (N)" header badge. Fires `submitReview` message. |

### Modified webview files

| File | Change |
|------|--------|
| `webview/overlay.ts` | Wire up floating "Add comment" button on `mouseup`/`selectionchange`. |
| `webview/thread.ts` | Add "Reply" button at the bottom of each expanded thread. |
| `webview/main.ts` | Mount `draft.ts` on load; handle `commentPosted`, `replyPosted`, `reviewSubmitted`, `postError` messages from extension host. |

### Modified extension host files

| File | Change |
|------|--------|
| `src/ReviewPanel.ts` | Store `owner`, `repo`, `prNumber`, `headSha`, `filePath` as instance fields after initial render. Handle four new inbound message types. |
| `src/GitHubClient.ts` | Add `postComment`, `postReply`, `submitReview` functions. Rename internal `githubGet` to `githubRequest` to support POST. |
| `src/types.ts` | Add new message types to protocol. |

---

## Message Protocol Extensions

**Webview → extension (new):**
```typescript
{ type: 'postComment'; line: number; body: string }
{ type: 'postReply'; inReplyToId: number; body: string }
{ type: 'addToDraft'; line: number; body: string }
{ type: 'submitReview' }
```

**Extension → webview (new):**
```typescript
{ type: 'commentPosted'; comment: PRComment }
{ type: 'replyPosted'; comment: PRComment }
{ type: 'reviewSubmitted'; comments: PRComment[] }
{ type: 'postError'; message: string }
```

---

## GitHub API

All three write operations use a new `githubRequest` helper that supports both GET and POST.

### Post a new comment
`POST /repos/{owner}/{repo}/pulls/{number}/comments`
```json
{ "body": "...", "commit_id": "<headSha>", "path": "<filePath>", "line": 42, "side": "RIGHT" }
```
`side: "RIGHT"` targets the right (new) side of the diff — correct for comments on current file content.

### Post a reply
Same endpoint, using `in_reply_to` instead of position fields:
```json
{ "body": "...", "in_reply_to": 123456 }
```

### Submit a draft review
`POST /repos/{owner}/{repo}/pulls/{number}/reviews`
```json
{
  "commit_id": "<headSha>",
  "body": "",
  "event": "COMMENT",
  "comments": [
    { "path": "<filePath>", "line": 42, "side": "RIGHT", "body": "..." }
  ]
}
```
Posts all pending draft comments atomically. Returns created comment objects which are sent back to the webview via `reviewSubmitted`.

---

## Optimistic UI & Error Handling

- **New comment / reply:** Inserted into the DOM immediately on submit using the typed body and the current user's login (available from the VS Code auth session). If the API call fails, the optimistic entry is removed and an inline error appears: "Failed to post — try again."
- **Draft comments:** Never sent to GitHub until "Submit review" is clicked. No optimistic risk. If `submitReview` fails, the draft stays intact and an error banner appears in the webview header.
- **Auth:** Reuses `getGitHubToken()`. If the token is expired, VS Code re-prompts automatically.
- **Mermaid / no anchor:** If the user selects text inside a Mermaid diagram or another area with no direct `data-line` ancestor, the compose box anchors to the nearest `data-line` block above the selection. The `line` value sent to GitHub is that block's opening line number.

---

## Out of Scope (Phase 2)

- Thread resolution (mark as resolved)
- Draft review persistence across panel close
- Editing or deleting posted comments
- Multi-file draft reviews
- Keyboard navigation for compose

---

## Test Strategy

1. Create a PR against `main` with commented lines in `docs/ARCHITECTURE.md`.
2. Check out the PR branch, open the file, run the command.
3. Select text → verify floating button appears and context menu works.
4. Post a comment immediately → verify it appears in the thread and on GitHub.
5. Add two comments to a draft → verify badge shows "(2)" → submit → verify both appear on GitHub.
6. Reply to an existing thread → verify it posts as a reply on GitHub.
7. Trigger a post failure (disconnect network) → verify optimistic entry is removed and error shown.
8. Close panel with pending draft → verify warning appears.
