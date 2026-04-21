# Markdown PR Review

A VSCode extension that overlays GitHub Pull Request review comments on rendered markdown previews, with Mermaid diagram support.

## What it does

Reviewing long-form markdown documents (design docs, RFCs, architecture notes, runbooks) through GitHub Pull Requests loses most of the value of writing in markdown. The diff view shows raw syntax; rendered output and review comments live in separate tools.

This extension makes VSCode the place where markdown PRs can be read *and* reviewed — rendered preview on screen, inline comment threads anchored to rendered elements, Mermaid diagrams supported.

## Features

- Renders markdown with `markdown-it` and overlays PR comment threads inline
- Comment bubbles anchored to the correct rendered line via source maps
- Click a bubble to expand the full thread
- Reply, edit, delete, resolve, and unresolve threads — all without leaving VSCode
- Draft review batching (post multiple comments as a single review)
- Mermaid diagram support with comments anchored to the fence block
- Respects VS Code's light/dark theme for Mermaid rendering

## Usage

1. Open any markdown file that is part of a GitHub PR
2. Click the comment icon in the editor title bar, or right-click → **Open PR Review**
3. Enter the PR number when prompted
4. The rendered preview opens with comment bubbles overlaid

## Authentication

The extension uses VS Code's built-in GitHub authentication (`vscode.authentication`). You will be prompted to sign in on first use. Alternatively, set a Personal Access Token in settings:

```
markdown-pr-review.githubToken
```

## Requirements

- VS Code 1.85 or later
- A GitHub account with access to the repository

## Install

### From the Marketplace

Search for **Markdown PR Review** in the Extensions view, or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=frankledo.markdown-pr-review).

### From a release VSIX

Download the `.vsix` from the [Releases page](https://github.com/FrankLedo/markdown-pr-review/releases) and run:

```bash
code --install-extension markdown-pr-review-*.vsix
```

## License

[MIT](LICENSE)
