# Changelog

## [1.6.0](https://github.com/FrankLedo/markdown-pr-review/compare/v1.5.1...v1.6.0) (2026-04-28)


### Features

* add output channel logger utility ([9bb4f51](https://github.com/FrankLedo/markdown-pr-review/commit/9bb4f5163c6f6ab98863df4e38dcf622697db7ef))
* anchor code fence comment bubbles to their specific line ([d1b50ff](https://github.com/FrankLedo/markdown-pr-review/commit/d1b50ff5f4353260b13c133aaccec68fbe6e8fd8))
* diagram-anchors DOM queries and fallback chain ([de838fb](https://github.com/FrankLedo/markdown-pr-review/commit/de838fbdb5b9e5d932485cd2118aa4e31302d382))
* diagram-anchors pure parser functions with tests ([19d4616](https://github.com/FrankLedo/markdown-pr-review/commit/19d4616246caf0a9ed823f3a3383337b9f7b6d0e))
* expand all skips floating bubbles; floating threads get close button ([0c45c0f](https://github.com/FrankLedo/markdown-pr-review/commit/0c45c0f0b940d1dfbca3262b592568b62a4404b3))
* overlay absolute positioning for diagram bubbles ([bf2adb0](https://github.com/FrankLedo/markdown-pr-review/commit/bf2adb0822970aadeb1f1bfaec7c132f608fe9f6))
* popover CSS styles ([a860bb6](https://github.com/FrankLedo/markdown-pr-review/commit/a860bb6772ddcc9c607f54a6b046724c855c6c70))
* thread popover placement mode ([fa09d59](https://github.com/FrankLedo/markdown-pr-review/commit/fa09d59ee3c15f60d3a4075e75dd63a5c99c6595))
* use selected text to find exact source line when adding a comment ([5e9f966](https://github.com/FrankLedo/markdown-pr-review/commit/5e9f966b5f7c5578cf302ef165408440936ff091))
* wire diagram anchor resolution into render pipeline ([80712ad](https://github.com/FrankLedo/markdown-pr-review/commit/80712ad8e4d507ac4dbf22ef5bfe55a64d7fd2e3))


### Bug Fixes

* clamp relLine at calculation point in resolveDiagramAnchors ([e2352f5](https://github.com/FrankLedo/markdown-pr-review/commit/e2352f57e37d304328834c2cbd369d8ae1970db8))
* extractSequenceActor handles -x arrow and quoted participant names ([db1ccb7](https://github.com/FrankLedo/markdown-pr-review/commit/db1ccb7181868d60db4eb9c8ebc775255f35df1d))
* extractSequenceActor returns full name for hyphenated participants ([aed5b4e](https://github.com/FrankLedo/markdown-pr-review/commit/aed5b4e90ec493c44dca85967db1244609c724bc))
* popover arrow clamping, dismiss listener cleanup, left-edge guard ([487c811](https://github.com/FrankLedo/markdown-pr-review/commit/487c811bfbdf0600512390dbd1e1c04ab0fa1f66))
* sequence message bubbles anchor to message height, not actor box ([b2d55d4](https://github.com/FrankLedo/markdown-pr-review/commit/b2d55d4e04d135d163b20870bb4953ee8ff9eb41))

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
