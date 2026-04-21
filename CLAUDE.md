# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VSCode extension that overlays GitHub PR review comments on rendered markdown previews, with Mermaid diagram support. **Status: planning only — no implementation code yet.**

## Commands

No build system exists yet. When scaffolded, a standard VSCode extension will use:

```bash
npm install
npm run compile       # tsc -p ./
npm run watch         # incremental compile
npm run test          # vscode test runner
vsce package          # produce .vsix
```

## Architecture

**Chosen approach: Path B (custom webview).** Own the full rendering pipeline — markdown-it → sanitization → Mermaid → comment overlay. This gives full DOM control without fighting the built-in preview's aggressive refresh cycle.

The core mechanism: `markdown-it` with source-map enabled emits `data-line` attributes on rendered elements. GitHub review comments carry a `line` field; the overlay finds the nearest `data-line` element and anchors a comment bubble there.

**Key design decisions** (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):

- **Follow the GitHub model:** For any review-related UX (thread resolution, comment actions, etc.), default to matching GitHub's own patterns. Users already know them. Only deviate with a specific reason.
- **Mermaid:** Overlays must wait for `mermaid.run()` to resolve before anchoring, or they land on placeholder elements. Pass `theme: 'dark' | 'default'` based on VSCode's active color theme kind.
- **Mermaid comment granularity (MVP):** Per fenced block — comment anchors to the fence line range, matching how GitHub anchors today.
- **Authentication:** Prefer `vscode.authentication.getSession('github', ['repo'])`; fall back to user-provided PAT in settings.
- **Line drift:** Resolve comments against the PR head SHA, not HEAD, to keep positions stable during review.

## Implementation Phases

1. **Phase 1 (MVP):** Command palette → open file with PR number → fetch comments → render webview → overlay bubbles → click to expand thread
2. **Phase 2:** Add-comment UX (select text, compose, post)
3. **Phase 3:** Thread lifecycle (reply, resolve, draft review batching)
4. **Phase 4:** Polish (theme sync, scroll sync, keyboard nav)

## Non-goals

Does not replace the GitHub Pull Requests extension for code review. Markdown only. GitHub only (no GitLab/Bitbucket). No offline support.
