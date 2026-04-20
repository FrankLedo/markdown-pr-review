# markdown-pr-review

A VSCode extension concept: overlay GitHub Pull Request review comments
on the rendered markdown preview pane, with Mermaid diagram support.

**Status:** planning. Docs only. No implementation yet.

## Problem

Reviewing long-form markdown documents (design docs, RFCs, architecture
notes, runbooks) through GitHub Pull Requests loses most of the value of
writing in markdown. The diff view shows raw syntax; rendered output and
review comments live in separate tools. Reviewers either read raw
markdown or export to a purpose-built doc platform (Confluence, Google
Docs, Notion) that already solves render-plus-comment in one place.

## Goal

Make VSCode the place where markdown PRs can be read *and* reviewed —
rendered preview on screen, inline comments anchored to rendered
elements, Mermaid diagrams supported, add-comment action available from
the preview.

## Docs

- [Plan](docs/PLAN.md) — phases and MVP scope
- [Architecture](docs/ARCHITECTURE.md) — design approach and decisions
- [Distribution](docs/DISTRIBUTION.md) — publishing and install strategy

## License

MIT
