# Changelog

## [1.5.1](https://github.com/FrankLedo/markdown-pr-review/compare/v1.5.0...v1.5.1) (2026-04-23)

### Bug Fixes

* anchor comment bubbles to table rows, not cells ([65fb184](https://github.com/FrankLedo/markdown-pr-review/commit/65fb1849f6f099fb088326dc86540d958f520ff9))
* CSS tooltips on nav arrows and gap between strip and dropdown ([7630403](https://github.com/FrankLedo/markdown-pr-review/commit/7630403e95c6dc4dc2f8555d88f0534f35c19914))
* show nav button tooltips below, not above header ([29da79d](https://github.com/FrankLedo/markdown-pr-review/commit/29da79d74bd24b5be6b23ea5492daea5e863e733))
* tooltip format matches OS shortcut style — no parens, spaced key ([ec719a2](https://github.com/FrankLedo/markdown-pr-review/commit/ec719a2a204330369ff4b217d229d11a043cca85))

* Comment bubbles on table rows anchor to a dedicated column instead of floating inside a cell, which was breaking table layout
* Panel tab title is always "Markdown PR Review" instead of the filename
* CSS tooltips on ↑↓ nav buttons (VS Code webviews suppress native `title` tooltips)
* Tooltip text matches OS keyboard shortcut style (`Previous  [` / `Next  ]`)

## [1.5.0] — 2026-04-23

### Added
* Status bar item shows current PR number (`PR #N`); hides on non-PR branches; updates on branch switch
* File switcher dropdown displays full paths when open, short names when closed
* Expand All / Close All buttons with pill styling

### Fixed
* Status bar appears on startup without needing to run a command
* Thread counts in the file dropdown were bleeding across files

## [1.4.0] — 2026-04-23

### Added
* YAML front matter is rendered as a styled key-value block instead of raw text
* Add-comment button turns amber when the selected line is outside the PR diff, signalling that the comment will be anchored to the nearest changed line

## [1.3.0] — 2026-04-23

### Added
* **Comment on any line** — select any text to add a comment; if the line is outside the diff it anchors to the nearest changed line and notes the original line in the comment body
* **File switcher** — dropdown in the review header lets you jump between all markdown files in the PR without reopening the panel

### Fixed
* Thread panels and compose boxes inside tables render as full-width rows, preserving table layout

## [1.2.0] — 2026-04-22

### Added
* **Navigation strip** — header bar with ↑↓ buttons and `[` / `]` keyboard shortcuts to jump between comment threads
* Expand All / Close All controls for thread panels
* Open thread state is preserved when switching between files

## [1.1.0] — 2026-04-22

### Added
* Marketplace icon and gallery banner

### Fixed
* TOC anchor links (`#heading`) now scroll correctly inside the VS Code webview
* Panel re-renders correctly when revealed after being hidden or after the webview context is destroyed

## [1.0.0] — 2026-04-21

Initial release.

* Renders GitHub PR review comments inline on rendered markdown, anchored via source maps
* Full thread lifecycle: reply, edit, delete, resolve, unresolve
* Draft review batching — accumulate comments and submit as one review
* Mermaid diagram support — comments anchor to the fence block; diagrams render in light or dark theme
* GitHub authentication via VS Code's built-in auth provider
