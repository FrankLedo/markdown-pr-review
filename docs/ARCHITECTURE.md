# Architecture

## Core constraint

VSCode's Comments API only works in text editors. Webviews cannot use
it. Overlays on a rendered preview must be HTML DOM elements inside the
webview, not native comment threads.

## Source-line to rendered-element mapping

The built-in markdown preview annotates rendered elements with a
`data-line` attribute. This is how scroll sync works: clicking a
heading in the preview scrolls the source editor to the correct line.
A custom webview using `markdown-it` can produce the same annotations
by enabling its source map plugin or adding `data-line` via a custom
renderer rule.

This mapping is what makes comment overlay possible at all. Each
GitHub review comment has a `line` field; the overlay finds the
element whose `data-line` is closest and anchors a comment bubble
there.

## Path A — Contribute to the built-in preview

VSCode exposes three relevant extension points:

- `markdown.previewScripts` — inject JS into the preview webview
- `markdown.previewStyles` — inject CSS
- `markdown.markdownItPlugins` — add markdown-it plugins

Multiple extensions can contribute to the same preview, so an overlay
extension can coexist with `bierner.markdown-mermaid` without
modification.

Pros: reuses VSCode's preview lifecycle, scroll sync, and image
handling.

Cons: preview refresh is aggressive; overlays must be reapplied on
every edit. Limited control over the DOM between renders.

## Path B — Custom webview

Render markdown and Mermaid independently inside a dedicated webview
panel. Own the full pipeline: markdown-it, sanitization, Mermaid
invocation, overlay application.

Pros: full control, simpler overlay lifecycle, freedom to add UX
features (table of contents, resolve states, selection-based comment
anchoring) without fighting preview refresh.

Cons: reimplements features the built-in preview ships for free
(scroll sync, some extension interop).

## Recommendation

Start with Path B. Freedom over the rendering pipeline is worth more
than reusing features that are incidental to the core value of
render-with-comments.

## Mermaid rendering

Mermaid renders asynchronously — it scans the DOM for `.mermaid` blocks
and swaps in an SVG. Overlay application must wait for `mermaid.run()`
to resolve, or overlays land on placeholder elements and jitter when
the SVG appears.

Theme: read the active VSCode color theme kind and pass
`theme: 'dark' | 'default'` to `mermaid.initialize` so diagrams match
the editor.

## Comment-on-diagram model

Three levels of granularity, in ascending cost:

1. **Per fenced block.** Treat a Mermaid block as one commentable
   unit. Comment anchors to the fence line range. Matches how GitHub
   anchors comments today. Recommended for MVP.
2. **Per node.** Mermaid `click` callbacks fire when a node is
   clicked. Serialize the node label as the anchor.
3. **Per SVG coordinate.** Pin annotations on `(x, y)`. Breaks on
   re-layout unless the diagram is frozen.

## Authentication

GitHub API calls need a token. Two reasonable sources:

- The built-in GitHub authentication provider
  (`vscode.authentication.getSession('github', ['repo'])`) — no extra
  UI, user is already signed in
- A user-provided Personal Access Token in extension settings

Prefer the built-in provider; fall back to PAT for automation
contexts.

## Line drift

Comments are anchored to a commit SHA plus path plus line. If the
file changes after a comment is posted, GitHub's position can drift.
Resolve comments against the PR head SHA, not HEAD, to keep positions
stable during review.

## Phase 3 — Thread lifecycle

Resolve, edit, and delete review comments directly from the webview,
syncing to GitHub in real time via REST (edit/delete) and GraphQL
(resolve/unresolve).

### Resolve model

Threads are resolved via GraphQL `resolveReviewThread` mutation, which
requires a thread-level `node_id` not exposed by the REST API. A
`fetchThreadMeta` query retrieves thread node_ids and maps them to
REST comment ids via the first comment's `databaseId`.

### Edit and delete

Edit uses REST `PATCH /repos/.../pulls/comments/{id}`. Delete uses
REST `DELETE /repos/.../pulls/comments/{id}` (returns 204). Both
operations are non-optimistic: the DOM updates only after the API
call succeeds.

### Error handling

Failed actions show a toast notification. The DOM reverts to its
prior state on any API error, matching the GitHub model of not
leaving UI in a half-resolved state.
