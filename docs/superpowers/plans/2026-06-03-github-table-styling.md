# GitHub-Style Table Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub-flavored CSS for markdown tables so they render with visible borders, zebra striping, and horizontal scrolling in both light and dark mode.

**Architecture:** Two changes to `src/ReviewPanel.ts` only — add `class="pr-content"` to the `#content` div and inject a CSS block scoped to `.pr-content table`. No renderer changes, no new files.

**Tech Stack:** TypeScript, VSCode extension webview (inline HTML/CSS), Node assert for tests, `npx tsx` test runner.

---

## File Map

| File | Change |
|------|--------|
| `src/ReviewPanel.ts` | Add `class="pr-content"` to `#content` div; add CSS block |
| `test/renderer-tables.test.ts` | New: verifies `renderMarkdown` produces table HTML from GFM input |

---

### Task 1: Write a renderer test for table HTML output

This test documents the expected `<table>` structure that the renderer produces from a GFM-style markdown table. It has no dependency on vscode and can run with `npx tsx`.

**Files:**
- Create: `test/renderer-tables.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer-tables.test.ts` with this content:

```typescript
import assert from 'node:assert/strict';
import { renderMarkdown } from '../webview/renderer';

// GFM table → standard HTML table elements
const out = renderMarkdown(`
| Name | Role |
|------|------|
| Alice | Admin |
| Bob | User |
`);

assert.ok(out.includes('<table'), 'output must contain a <table> element');
assert.ok(out.includes('<th>'), 'output must contain <th> header cells');
assert.ok(out.includes('<td>'), 'output must contain <td> data cells');
assert.ok(out.includes('<tr>'), 'output must contain <tr> rows');
assert.ok(out.includes('Alice'), 'table cell content must be present');
assert.ok(out.includes('Bob'), 'table cell content must be present');

// Front-matter tables must not bleed through (they use .pr-front-matter wrapper)
const withFm = renderMarkdown(`---
title: My PR
---

| Col A | Col B |
|-------|-------|
| 1 | 2 |
`);
assert.ok(withFm.includes('class="pr-front-matter"'), 'front matter block must keep its wrapper class');
assert.ok(withFm.includes('<table'), 'body table must still be present after front matter');

console.log('All renderer-tables tests passed ✓');
```

- [ ] **Step 2: Run the test**

```bash
cd ~/Projects/markdown-pr-review && npx tsx test/renderer-tables.test.ts
```

Expected: `All renderer-tables tests passed ✓`

> If it fails with "table not found", markdown-it's table rule may need enabling. In `webview/renderer.ts`, after `const md = new MarkdownIt(...)`, add `md.enable('table')`. Then re-run.

- [ ] **Step 3: Add the new test to the npm test script**

In `package.json`, find the `"test"` script and append the new file:

```json
"test": "npx tsx test/diagram-anchors.test.ts && npx tsx test/renderer-details.test.ts && npx tsx test/renderer-tables.test.ts"
```

- [ ] **Step 4: Run the full test suite**

```bash
cd ~/Projects/markdown-pr-review && npm test
```

Expected: all three test files print their `passed ✓` lines, no errors.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/markdown-pr-review && git add test/renderer-tables.test.ts package.json && git commit -m "test: add renderer test for GFM table HTML output"
```

---

### Task 2: Add `class="pr-content"` to the `#content` div

**Files:**
- Modify: `src/ReviewPanel.ts` (the HTML template string, around line 677)

- [ ] **Step 1: Open `src/ReviewPanel.ts` and find the content div**

It looks like this (near the bottom of the `_getHtmlForWebview` method):

```html
  <div id="content"><p>Loading&#x2026;</p></div>
```

- [ ] **Step 2: Add the class**

Change it to:

```html
  <div id="content" class="pr-content"><p>Loading&#x2026;</p></div>
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
cd ~/Projects/markdown-pr-review && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/markdown-pr-review && git add src/ReviewPanel.ts && git commit -m "feat: add pr-content class to content div for table style scoping"
```

---

### Task 3: Add GitHub-style table CSS

**Files:**
- Modify: `src/ReviewPanel.ts` (the `<style>` block, after line 630 where `.pr-bubble-cell` ends)

- [ ] **Step 1: Find the insertion point**

In the `<style>` block, locate this rule (it's near the end before the closing `</style>`):

```css
    .pr-bubble-cell .pr-bubble { float: none; margin-left: 0; }
```

- [ ] **Step 2: Insert the table CSS block immediately after that rule**

Add the following after `.pr-bubble-cell .pr-bubble { float: none; margin-left: 0; }`:

```css
    .pr-content table {
      border-collapse: collapse;
      border-spacing: 0;
      display: block;
      overflow: auto;
      width: max-content;
      max-width: 100%;
      margin: 1em 0;
    }
    .pr-content th,
    .pr-content td {
      border: 1px solid #d0d7de;
      padding: 6px 13px;
    }
    .pr-content tr:nth-child(2n) {
      background-color: #f6f8fa;
    }
    .pr-content thead tr {
      background-color: transparent;
    }
    @media (prefers-color-scheme: dark) {
      .pr-content th,
      .pr-content td {
        border-color: #30363d;
      }
      .pr-content tr:nth-child(2n) {
        background-color: #161b22;
      }
    }
```

- [ ] **Step 3: Verify the existing front-matter and thread-row overrides are still below this block**

The rules `.pr-front-matter table`, `.pr-table-thread-row td`, and `.pr-bubble-cell` must still exist in the file. Grep to confirm:

```bash
cd ~/Projects/markdown-pr-review && grep -n "pr-front-matter table\|pr-table-thread-row\|pr-bubble-cell" src/ReviewPanel.ts
```

Expected: all three appear at their original line numbers (approximately 422, 623, 624–631).

- [ ] **Step 4: Run the full test suite**

```bash
cd ~/Projects/markdown-pr-review && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/markdown-pr-review && git add src/ReviewPanel.ts && git commit -m "feat: add GitHub-style table CSS scoped to .pr-content (issue #22)"
```

---

### Task 4: Build and manual verification

- [ ] **Step 1: Build the extension**

```bash
cd ~/Projects/markdown-pr-review && npm run compile
```

Expected: exits with no errors.

- [ ] **Step 2: Open the extension in VS Code and verify**

Press `F5` in VS Code to launch the Extension Development Host. Open a markdown file that has a PR number, run the **Open PR Review** command, and check a PR whose description or a comment contains a markdown table.

Verify:
- [ ] Table has visible borders on all cell sides
- [ ] Every other data row has a light grey background (`#f6f8fa` in light theme, `#161b22` in dark theme)
- [ ] Header row is not zebra-striped
- [ ] A wide table (more columns than fit) scrolls horizontally rather than overflowing the panel
- [ ] Front matter YAML block (if the PR has one) still renders as a compact borderless table inside the `.pr-front-matter` box
- [ ] Inline comment thread bubbles in table rows still render correctly (no borders on the thread row)

- [ ] **Step 3: Close the issue**

```bash
cd ~/Projects/markdown-pr-review && gh issue close 22 --comment "Fixed in this commit. Tables now render with GitHub-style borders, zebra striping, and horizontal scroll. Light and dark mode handled via @media prefers-color-scheme."
```
