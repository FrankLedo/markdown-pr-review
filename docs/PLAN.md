# Plan

High-level implementation sketch. Phases are rough; scope each one down
before starting.

## Phase 0 — Decide the architecture

Two paths exist. Pick one before coding. See
[Architecture](ARCHITECTURE.md).

- Path A: contribute to the built-in markdown preview via extension
  points (`markdown.previewScripts`, `markdown.markdownItPlugins`).
- Path B: own a dedicated webview panel that renders markdown and
  comment overlays together.

Recommended starting point: Path B, for full control over rendering,
comment overlay, and the eventual add-comment UX.

## Phase 1 — MVP read-only

Ship the smallest useful thing: viewing PR comments on rendered
markdown.

- Open a markdown file with a known PR number via the command palette
- Fetch PR review comments from the GitHub API
- Render markdown in a webview with Mermaid support
- Overlay comment bubbles at each commented line using source-line to
  rendered-element mapping
- Click bubble to expand the full comment thread in a side pane

Out of scope for this phase:

- Adding new comments
- Replying to threads
- Resolving threads
- Multi-file PR review

## Phase 2 — Add-comment UX

Once read-only works, add the write path.

- Select rendered text or click a line
- Open a comment composer with markdown support
- Post the comment to the GitHub API at the correct line position
- Show the new thread inline without a full refresh

## Phase 3 — Thread lifecycle

Fill in the rest of the review loop.

- Reply to existing threads
- Resolve and unresolve threads
- Draft vs submitted review states
- Batching comments into a single review submission

## Phase 4 — Polish

Rough list, prioritize by real usage:

- Dark / light theme matching for Mermaid
- Scroll sync with source editor
- Keyboard navigation between threads
- @-mention autocomplete
- Task list checkbox support
- Image rendering with correct base URL resolution

## Non-goals

Keep scope contained. Things this project does not try to do:

- Replace the existing GitHub Pull Requests extension for code review
- Support non-markdown file types
- Support non-GitHub providers (GitLab, Bitbucket, Azure DevOps)
- Offline operation
