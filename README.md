# Markdown PR Review

Read and review GitHub Pull Request comments on rendered markdown — right inside VS Code.

## The problem

Reviewing long-form markdown (design docs, RFCs, runbooks, architecture notes) through a GitHub PR is painful. The diff view shows raw syntax. The rendered preview and the review comments live in separate places. You end up bouncing between tabs, losing context with every switch.

## What this does

Opens a rendered preview of your markdown file with GitHub PR comment threads overlaid inline — anchored to the exact rendered element they were left on. No raw syntax. No tab switching.

![Rendered markdown with inline PR comment threads]

## Features

- **Inline comment threads** anchored to the rendered line via source maps
- **Full thread lifecycle** — reply, edit, delete, resolve, unresolve
- **Draft review batching** — accumulate comments and submit as one review
- **Mermaid diagram support** — comments anchor to the fence block; diagrams render in VS Code's light or dark theme
- **GitHub authentication** via VS Code's built-in auth — no setup required

## Usage

1. Open any markdown file that belongs to a GitHub PR
2. Click the **comment icon** in the editor title bar, right-click → **Open PR Review**, or run `Open PR Review` from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) if the icon doesn't appear
3. Enter the PR number
4. Browse the rendered preview with comment threads overlaid

## Authentication

Uses VS Code's built-in GitHub authentication — you'll be prompted to sign in on first use. Or set a Personal Access Token manually:

```bash
markdown-pr-review.githubToken
```

## Requirements

VS Code 1.85 or later.

## Install

Search **Markdown PR Review** in the Extensions view, or:

```bash
code --install-extension markdown-pr-review-*.vsix
```
## License

[MIT](LICENSE)
