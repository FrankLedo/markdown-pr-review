# Contributing

## Prerequisites

- Node.js 18+
- VS Code 1.85+

## Setup

```bash
git clone https://github.com/FrankLedo/markdown-pr-review.git
cd markdown-pr-review
npm install
```

## Build

```bash
npm run compile       # one-off build
npm run watch         # rebuild on change
```

Output goes to `dist/`.

## Run locally

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded. Switch to a branch with an open GitHub PR, then click the status bar item or run **Markdown PR Review: Open Review Panel** from the Command Palette.

## Package

```bash
npx vsce package --no-dependencies
code --install-extension markdown-pr-review-*.vsix --force
```

## Submitting changes

1. Fork the repo and create a branch off `main`
2. Make your changes and test manually using the steps above
3. Open a pull request — describe what you changed and why

## Reporting bugs

Use the [Bug Report](https://github.com/FrankLedo/markdown-pr-review/issues/new?template=bug_report.md) issue template.
