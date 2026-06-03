# GitHub-Style Table Rendering — Design Spec

**Issue:** #22  
**Date:** 2026-06-03  
**Status:** Approved

---

## Problem

Tables in rendered markdown do not match GitHub's visual style. They appear as unstyled HTML: no cell borders, no alternating row backgrounds. This makes wide or dense tables hard to scan.

---

## Goal

Tables should render with:
- Visible borders on all cell sides
- Alternating row backgrounds (zebra striping)
- Header row visually distinct (bold text is already browser default; no extra markup needed)
- Wide tables scroll horizontally rather than overflow the panel
- Both light and dark mode handled

---

## Approach

**Scope new table CSS to `.pr-content`** — a class added to the existing `#content` wrapper div. This isolates the new rules from two existing special-case table contexts that must remain unaffected:
- `.pr-front-matter table` — YAML front matter metadata display
- `.pr-table-thread-row td` / `.pr-bubble-cell` — thread rows injected into markdown tables

No JS changes. No renderer changes. No new files.

---

## CSS

Add to the `<style>` block in `ReviewPanel.ts`, after the existing `.pr-table-thread-row` and `.pr-bubble-cell` rules:

```css
/* GitHub-style markdown tables */
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

Color values are GitHub's exact markdown table colors:
- Light border: `#d0d7de`
- Light zebra: `#f6f8fa`
- Dark border: `#30363d`
- Dark zebra: `#161b22`

The `thead tr { background-color: transparent }` rule prevents the `:nth-child(2n)` zebra stripe from accidentally tinting the header row (which is always `<tr>` at child position 1, but explicit is safer).

---

## HTML Change

In `ReviewPanel.ts`, the `#content` div gains a class:

```html
<div id="content" class="pr-content"><p>Loading&#x2026;</p></div>
```

---

## What Is Not Changed

- `.pr-front-matter table` — unchanged, front matter retains its compact borderless layout
- `.pr-table-thread-row td`, `.pr-bubble-cell` — unchanged, thread injection into tables unaffected
- `webview/renderer.ts` — no changes
- No new files

---

## Testing Notes

Verify with a markdown file containing:
1. A simple 3-column table — should show borders and zebra striping
2. A wide table (10+ columns) — should scroll horizontally, not overflow
3. A table immediately after a YAML front matter block — front matter should remain unstyled
4. A table with an inline thread bubble — thread row should remain borderless
5. Both light and dark VSCode themes — colors should switch appropriately
