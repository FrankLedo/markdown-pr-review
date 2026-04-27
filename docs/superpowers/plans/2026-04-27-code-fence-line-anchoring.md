# Code Fence Line Anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Position comment bubbles on fenced code blocks at the exact rendered line within the `<pre>` block rather than at the top of the block.

**Architecture:** Add a single `isCodeFence` branch in `placeOverlays` in `webview/overlay.ts`, immediately after the existing `isDiagram` branch. The bubble is absolutely positioned within the anchor using `getComputedStyle` to measure the rendered line height and top padding of the `<pre>` block. No other files change.

**Tech Stack:** TypeScript, DOM `getComputedStyle`, existing markdown-it `data-line` source maps.

---

## File Map

- **Modify:** `webview/overlay.ts` — add `isCodeFence` branch in `placeOverlays` (after line 138, before line 140 in current HEAD)

---

### Task 1: Add code fence line anchoring to `placeOverlays`

**Files:**
- Modify: `webview/overlay.ts:125-152`

**Context:**

The current `placeOverlays` loop (lines 118–152) handles two cases: diagram anchors (`isDiagram`) and everything else (table cells, list items, plain blocks). We are adding a third case between them.

Key values:
- `anchor.dataset['line']` — 0-indexed line of the fence-open (``` `) line in the markdown source
- `thread.line` — 1-indexed GitHub line number of the root comment
- `relLine = Math.max(0, thread.line - blockStartLine - 2)` — 0-indexed offset into the code content; the `-2` accounts for the 0→1 index gap and the fence-open line itself
- `lineHeight` from `getComputedStyle(codeEl).lineHeight`; fallback to `18` if the value is `'normal'` or unparseable
- `paddingTop` from `getComputedStyle(pre).paddingTop`
- Bubble is appended to `anchor` with `position:absolute`, `right:8px`, `top: paddingTop + relLine * lineHeight`
- `createBubble` is called without `isDiagram=true`, so `placement` stays `'inline'` — code fence threads open as inline panels, not popovers

- [ ] **Step 1: Open `webview/overlay.ts` and locate the insertion point**

The block to modify is the `for (const thread of threads)` loop in `placeOverlays`. After the `if (isDiagram)` block ends with `continue` (current line 138), add the new `isCodeFence` block before the table/list/default handling:

```typescript
if (isDiagram) {
  const pos = diagramAnchors?.get(thread.rootId);
  anchor.style.position = 'relative';
  bubble.style.position = 'absolute';
  if (pos) {
    bubble.style.left = `${pos.x}px`;
    bubble.style.top = `${pos.y}px`;
  } else {
    bubble.style.right = '8px';
    bubble.style.top = '8px';
  }
  anchor.appendChild(bubble);
  continue;
}

// ← INSERT isCodeFence BLOCK HERE

const tr = anchor.closest('tr') as HTMLElement | null;
```

- [ ] **Step 2: Insert the `isCodeFence` block**

Add the following immediately after the `isDiagram` block's closing `continue` statement and before `const tr = ...`:

```typescript
const pre = anchor.querySelector('pre');
const isCodeFence = !isDiagram && pre !== null;
if (isCodeFence) {
  const codeEl = pre!.querySelector('code') ?? pre!;
  const blockStartLine = parseInt(anchor.dataset['line'] ?? '0', 10);
  const relLine = Math.max(0, thread.line - blockStartLine - 2);
  const rawLineHeight = parseFloat(getComputedStyle(codeEl).lineHeight);
  const lineHeight = isNaN(rawLineHeight) ? 18 : rawLineHeight;
  const paddingTop = parseFloat(getComputedStyle(pre!).paddingTop);
  anchor.style.position = 'relative';
  bubble.style.position = 'absolute';
  bubble.style.right = '8px';
  bubble.style.top = `${paddingTop + relLine * lineHeight}px`;
  anchor.appendChild(bubble);
  continue;
}
```

After the edit, the full thread-placement section of `placeOverlays` should read:

```typescript
for (const thread of threads) {
  const anchor = findAnchorElement(container, thread.line);
  if (!anchor) continue;
  const meta = threadMeta.find(m => m.rootCommentId === thread.rootId);
  const isDiagram = anchor.classList.contains('mermaid');
  const bubble = createBubble(thread, meta, callbacks, isDiagram);

  if (isDiagram) {
    const pos = diagramAnchors?.get(thread.rootId);
    anchor.style.position = 'relative';
    bubble.style.position = 'absolute';
    if (pos) {
      bubble.style.left = `${pos.x}px`;
      bubble.style.top = `${pos.y}px`;
    } else {
      bubble.style.right = '8px';
      bubble.style.top = '8px';
    }
    anchor.appendChild(bubble);
    continue;
  }

  const pre = anchor.querySelector('pre');
  const isCodeFence = !isDiagram && pre !== null;
  if (isCodeFence) {
    const codeEl = pre!.querySelector('code') ?? pre!;
    const blockStartLine = parseInt(anchor.dataset['line'] ?? '0', 10);
    const relLine = Math.max(0, thread.line - blockStartLine - 2);
    const rawLineHeight = parseFloat(getComputedStyle(codeEl).lineHeight);
    const lineHeight = isNaN(rawLineHeight) ? 18 : rawLineHeight;
    const paddingTop = parseFloat(getComputedStyle(pre!).paddingTop);
    anchor.style.position = 'relative';
    bubble.style.position = 'absolute';
    bubble.style.right = '8px';
    bubble.style.top = `${paddingTop + relLine * lineHeight}px`;
    anchor.appendChild(bubble);
    continue;
  }

  const tr = anchor.closest('tr') as HTMLElement | null;
  if (tr) {
    const cell = document.createElement('td');
    cell.className = 'pr-bubble-cell';
    tr.appendChild(cell);
    cell.appendChild(bubble);
  } else if (anchor.tagName.toLowerCase() === 'li') {
    const floatTarget = (anchor.querySelector(':scope > p') as HTMLElement) ?? anchor;
    floatTarget.prepend(bubble);
  } else {
    anchor.prepend(bubble);
  }
}
```

- [ ] **Step 3: Build**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review"
npm run compile
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Install locally and smoke-test**

```bash
vsce package --no-dependencies && code --install-extension markdown-pr-review-*.vsix
```

Open VS Code, switch to the `test/pr-review-fixture` branch (PR #11), open the PR Review panel on `test/fixtures/pr-review-test.md`. Verify:

1. A comment on a specific line inside the `## Fenced Code Block` section (lines 49–54 in the fixture, e.g. `return \`Hello, ${name}!\`` on line 50) shows its bubble vertically offset to that line, not stuck at the top of the block.
2. Clicking the bubble opens an inline thread panel (not a floating popover).
3. Comments on non-code-fence anchors (headings, paragraphs, table cells, list items, Mermaid diagrams) are unaffected.

- [ ] **Step 5: Commit**

```bash
git add webview/overlay.ts
git commit -m "feat: anchor code fence comment bubbles to their specific line"
```
