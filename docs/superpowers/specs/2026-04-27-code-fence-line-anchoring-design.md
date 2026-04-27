# Code Fence Line Anchoring

**Date:** 2026-04-27
**Status:** Approved — ready for implementation

## Problem

Comment bubbles on fenced code blocks anchor to the block as a whole (the fence-open line). A comment on a specific line inside the block should appear at the visual height of that line.

## Goal

Position code fence bubbles at the exact line within the rendered `<pre>` block, using the same absolute-positioning pattern already in place for Mermaid diagrams.

## Architecture

One file changes: `webview/overlay.ts`. A new `isCodeFence` branch is added in `placeOverlays` immediately after the existing `isDiagram` branch. No renderer changes, no new files, no new types.

## Detection

A code fence anchor satisfies both conditions:
- `!isDiagram` (not `.mermaid`)
- `anchor.querySelector('pre') !== null`

## Position Calculation

```typescript
const pre = anchor.querySelector('pre')!;
const codeEl = pre.querySelector('code') ?? pre;
const blockStartLine = parseInt(anchor.dataset['line'] ?? '0', 10);
const relLine = Math.max(0, thread.line - blockStartLine - 2);
const lineHeight = parseFloat(getComputedStyle(codeEl).lineHeight);
const paddingTop = parseFloat(getComputedStyle(pre).paddingTop);
```

- `blockStartLine` — 0-indexed `data-line` on the anchor (the fence-open line).
- `thread.line` — 1-indexed GitHub line number of the root comment.
- `relLine` — 0-indexed offset into the code content. The `-2` accounts for the 0→1 index difference and the fence-open line itself. Clamped to 0 to handle edge cases.
- `lineHeight` — exact rendered line height in pixels from the browser's computed style.
- `paddingTop` — top padding of the `<pre>` block, so the first line (relLine=0) lands on the first visible code line rather than the top edge of the block.

## Bubble Placement

```typescript
anchor.style.position = 'relative';
bubble.style.position = 'absolute';
bubble.style.right = '8px';
bubble.style.top = `${paddingTop + relLine * lineHeight}px`;
anchor.appendChild(bubble);
```

Identical pattern to diagram bubbles. The bubble floats at the right edge of the block, vertically aligned to the commented line. Thread opens as an inline panel (not a popover), using the existing default `placement: 'inline'` — code fence comments don't need the popover treatment since the block is always in document flow.

## Fallback

If `lineHeight` is NaN (e.g. `getComputedStyle` returns `'normal'`), fall back to a hardcoded `18` px, which matches VS Code's default monospace line height.

## Out of Scope

- Syntax-highlighted line ranges (multi-line comments spanning several lines)
- Scroll the bubble into view when it's inside a tall block that's off-screen
