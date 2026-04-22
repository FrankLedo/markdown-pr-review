# Changelog

## [1.1.3](https://github.com/FrankLedo/markdown-pr-review/compare/v1.1.2...v1.1.3) (2026-04-22)


### Bug Fixes

* handle #anchor clicks manually to work around VS Code webview navigation intercept ([eba556c](https://github.com/FrankLedo/markdown-pr-review/commit/eba556ca5c843e40c6a507399e80ba26ee869fbb))
* use ready message to re-render webview after context is destroyed ([ca9345f](https://github.com/FrankLedo/markdown-pr-review/commit/ca9345f5ecf4e30f19ce3e45e626aabaf65738ce))

## [1.1.2](https://github.com/FrankLedo/markdown-pr-review/compare/v1.1.1...v1.1.2) (2026-04-22)


### Bug Fixes

* re-render webview when panel becomes visible after being hidden ([b0ef3a0](https://github.com/FrankLedo/markdown-pr-review/commit/b0ef3a0bfc0942c38bf6f7ab0fd625d147ed39de))

## [1.1.1](https://github.com/FrankLedo/markdown-pr-review/compare/v1.1.0...v1.1.1) (2026-04-22)


### Bug Fixes

* accept .md extension as fallback when languageId is not markdown ([311fae0](https://github.com/FrankLedo/markdown-pr-review/commit/311fae059fbdd2fb9313a31dbb6009a7c7d79d09))
* add markdown-it-anchor for TOC link support; add test fixture doc ([c3d9acb](https://github.com/FrankLedo/markdown-pr-review/commit/c3d9acb19b255ce2c4c0e0e562b18a450da2d171))

## [1.1.0](https://github.com/FrankLedo/markdown-pr-review/compare/v1.0.0...v1.1.0) (2026-04-21)


### Features

* add marketplace icon, gallery banner, and rewrite README ([e6a79d8](https://github.com/FrankLedo/markdown-pr-review/commit/e6a79d89c86493cea7ad555561386903c58a33f8))

## 1.0.0 (2026-04-21)


### Features

* add compose box component ([635e838](https://github.com/FrankLedo/markdown-pr-review/commit/635e838773db2cfd3f9445f5c81f70e14b7034ee))
* add DraftManager for pending review comments ([825b8c6](https://github.com/FrankLedo/markdown-pr-review/commit/825b8c698fdfadb042de04020340278f25a1d062))
* add GitHub write functions — postComment, postReply, submitDraftReview ([12a30f4](https://github.com/FrankLedo/markdown-pr-review/commit/12a30f4ee07638b42770e461098da524143d2b0c))
* add githubGraphQL, fetchThreadMeta, editComment, deleteComment, resolveThread, unresolveThread ([a8ac497](https://github.com/FrankLedo/markdown-pr-review/commit/a8ac497453ffa7386c5579db2d99533e7e57a8a2))
* add selection handlers, floating button, context menu, Reply button ([6655a6a](https://github.com/FrankLedo/markdown-pr-review/commit/6655a6ad0dd84949c3e96c52a0bf9d52641bf0de))
* comment overlay — thread grouping, bubble positioning, thread expand/collapse ([1bf1cda](https://github.com/FrankLedo/markdown-pr-review/commit/1bf1cda24a69a83d4df7427940a335e220fc88b0))
* extend message protocol types for Phase 2 ([b9e2b97](https://github.com/FrankLedo/markdown-pr-review/commit/b9e2b9722a95c27b17bb0460607f5f02c7b25bad))
* extend types for phase 3 — ThreadMeta, edit/delete/resolve messages ([aafcbb7](https://github.com/FrankLedo/markdown-pr-review/commit/aafcbb70b7faa84a7aa16d1cb63acb7b99271efe))
* extension scaffold — command, title bar icon, webview panel opens ([6a798f7](https://github.com/FrankLedo/markdown-pr-review/commit/6a798f74993b59f24f59d8ba10cd9f713bd77cd7))
* GitContext — reads branch and owner/repo from git remote ([29d39e4](https://github.com/FrankLedo/markdown-pr-review/commit/29d39e4341132836792671cc6107bd2aef3d3211))
* GitHubClient — VS Code auth, find PR by branch, fetch review comments ([c375065](https://github.com/FrankLedo/markdown-pr-review/commit/c375065b4a2a10026cee4eb29973ea4aecd21d0c))
* pass headSha and userLogin from extension command to ReviewPanel ([34f7a96](https://github.com/FrankLedo/markdown-pr-review/commit/34f7a9601191a17bb33578e0b2bc17a76ca8db8f))
* refactor toggleThread to options object; add dot menu, resolve/unresolve button ([11b8d96](https://github.com/FrankLedo/markdown-pr-review/commit/11b8d966d815aa444cbe99cb5704c493fd7db5b2))
* ReviewPanel stores PR context, handles write messages, adds compose CSS ([82e3685](https://github.com/FrankLedo/markdown-pr-review/commit/82e368506f70039abb698bb928b286b6fd311751))
* shared PRComment and RenderMessage types ([7194f9d](https://github.com/FrankLedo/markdown-pr-review/commit/7194f9d031a7024678f91ed43deb1133e75f1445))
* store threadMeta in main; handle commentEdited, commentDeleted, threadResolved, threadUnresolved ([cee3089](https://github.com/FrankLedo/markdown-pr-review/commit/cee3089838a15d74799d764bce9b631bf797d38a))
* update placeOverlays to accept threadMeta and action callbacks; resolved bubble style ([491f0e7](https://github.com/FrankLedo/markdown-pr-review/commit/491f0e7c793f505445c4ed5618ab594f2397da90))
* webview markdown-it renderer with data-line source mapping ([b73cc60](https://github.com/FrankLedo/markdown-pr-review/commit/b73cc600090ea180cbd510c284ad612ef2079490))
* webview pipeline — markdown render, mermaid, comment overlay wired end-to-end ([c9fd772](https://github.com/FrankLedo/markdown-pr-review/commit/c9fd772975438915cbeb8f19bfdbaf1c9b212067))
* wire compose, draft, and message handlers in main.ts ([6e12337](https://github.com/FrankLedo/markdown-pr-review/commit/6e12337745ae0f731f854d4cdf18a88c48a70a8c))
* wire fetchThreadMeta, handle edit/delete/resolve messages in ReviewPanel ([a00d3f5](https://github.com/FrankLedo/markdown-pr-review/commit/a00d3f5fc3165cababa2e4c9dc70177719ad5c3f))
* wire real GitHub API — branch → PR → comments → overlay ([ff1de33](https://github.com/FrankLedo/markdown-pr-review/commit/ff1de332cdf559c96b7419722abcb460f871a0ab))


### Bug Fixes

* 1-based line for GitHub API, fixed button position near selection ([6766948](https://github.com/FrankLedo/markdown-pr-review/commit/6766948928cc2b5ddac72820e92d85f2dce043b7))
* anchor bubbles to correct list item by normalising line numbers ([ac8fd5e](https://github.com/FrankLedo/markdown-pr-review/commit/ac8fd5e0fefb9ff080fa75695fa95313387ebc43))
* bubble and compose box placement in loose/tight list items ([8cf194a](https://github.com/FrankLedo/markdown-pr-review/commit/8cf194ad42e48741bba553c78264c682ee687ad0))
* bundle mermaid deps into webview — remove incorrect externals ([21e60d2](https://github.com/FrankLedo/markdown-pr-review/commit/21e60d2daacaa7f93dc259585697336651f0507e))
* button click suppressed by doc mouseup; clamp btn left; resolve symlinks for relPath ([1ebbf38](https://github.com/FrankLedo/markdown-pr-review/commit/1ebbf3838ab107b15874b76dc0e2ad3bc025e575))
* clear draft badge before re-initializing DraftManager on render ([cf0a951](https://github.com/FrankLedo/markdown-pr-review/commit/cf0a951e44c6b07e055fa213c75adfbc17185fe7))
* compose box placement in list items ([b361c7e](https://github.com/FrankLedo/markdown-pr-review/commit/b361c7eb67443102c6f3db0f3364cd7f4d7dae1c))
* force arm64 for VS Code build task, add optional esbuild platform deps ([7ab65c9](https://github.com/FrankLedo/markdown-pr-review/commit/7ab65c9f8bd8b840d2ef70a34a1be64696a32b2f))
* guard contentEl null in message handler; guard draft?.clear in reviewSubmitted ([12d2d58](https://github.com/FrankLedo/markdown-pr-review/commit/12d2d58c1b9b7267b7a272151a6c0561e3b3ffa9))
* improve GitContext error messages ([afa5547](https://github.com/FrankLedo/markdown-pr-review/commit/afa55471bb980b2f363ed4047558921405f3092d))
* keep thread panel open after edit/resolve/unresolve actions ([e6d0ec8](https://github.com/FrankLedo/markdown-pr-review/commit/e6d0ec8493f4b49193bf3d194175241f3e30748c))
* mapComment throws on null line, postReply accepts fallbackLine ([5ac4903](https://github.com/FrankLedo/markdown-pr-review/commit/5ac4903947afb889246c4664877721a60ae2e383))
* move bundled deps to devDependencies, update vscodeignore, add types stub ([459e7a9](https://github.com/FrankLedo/markdown-pr-review/commit/459e7a9d6f387769fbe46e43ff6343b87a9b74cd))
* open worktree folder automatically in Extension Development Host ([57806f2](https://github.com/FrankLedo/markdown-pr-review/commit/57806f2f15e3783f9f191a9f56d6633d57b4e177))
* postinstall ensures x64 esbuild binary for VS Code Rosetta compat ([29773f4](https://github.com/FrankLedo/markdown-pr-review/commit/29773f47864dcdd3d39b728a9694bc8b56166428))
* prepend bubble instead of append so float:right lands at top-right ([07e783f](https://github.com/FrankLedo/markdown-pr-review/commit/07e783fa2fab66cd991e4cd67b172ef1c336e660))
* remove DOM from extension host tsconfig, add skipLibCheck ([8780f4c](https://github.com/FrankLedo/markdown-pr-review/commit/8780f4ce56185d7242575f731d0dc940e24becea))
* rename release-please job id to avoid hyphen in expression syntax ([9927cf0](https://github.com/FrankLedo/markdown-pr-review/commit/9927cf009d1496ad0e837cd3685655db69d62a88))
* resolve build and runtime issues for Phase 1 MVP ([c210c98](https://github.com/FrankLedo/markdown-pr-review/commit/c210c9839f201e35b6cf100bc5c1c2555cb7fc23))
* restore symlink comment in extension.ts ([42a05c0](https://github.com/FrankLedo/markdown-pr-review/commit/42a05c0f5498526dcc9bcb5468c84158c9d7ffb2))
* submitDraftReview fetches review comments via follow-up GET, reuse mapComment ([a97412b](https://github.com/FrankLedo/markdown-pr-review/commit/a97412b55a16d3d5cb8c9d82173fbc56bf01d628))
* thread toggle checks nextElementSibling not querySelector ([314c970](https://github.com/FrankLedo/markdown-pr-review/commit/314c97057a6ff4d5c8860b37426bed9c20d43057))
* use env context for secret conditionals in publish job ([c3030a4](https://github.com/FrankLedo/markdown-pr-review/commit/c3030a4eba89effa2f10ff31392130987f5943cf))

## Changelog

All notable changes will be documented here by release-please.
