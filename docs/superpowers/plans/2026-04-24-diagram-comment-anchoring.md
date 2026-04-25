# Diagram Comment Anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin comment bubbles to specific nodes/edges/actors in rendered Mermaid diagrams, with a fallback chain (type-aware → text-search → proportional Y → corner), and open threads as floating viewport-clamped popovers instead of inserting after the diagram.

**Architecture:** A new `diagram-anchors.ts` module runs after `mermaid.run()` and before `placeOverlays()`, producing a `Map<rootId, Point>` of absolute positions within each `.mermaid` div. `overlay.ts` uses these positions to absolutely-position bubbles. `thread.ts` gains a `'popover'` placement mode that attaches a `position:fixed` panel to `document.body` near the bubble.

**Tech Stack:** TypeScript, DOM APIs, Mermaid 10 SVG output conventions, `tsx` (new devDep) for running unit tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `webview/diagram-anchors.ts` | **Create** | `Point` type, all resolution logic, both parsers, fallback chain |
| `webview/thread.ts` | **Modify** | Add `placement` option; extract `buildPanel`; add `showAsPopover` |
| `webview/overlay.ts` | **Modify** | Accept `diagramAnchors` param; absolutely-position diagram bubbles; pass `isDiagram` flag |
| `webview/main.ts` | **Modify** | Capture mermaid sources; call resolver; pass results through |
| `src/ReviewPanel.ts` | **Modify** | Add popover CSS to `<style>` block (~line 629) |
| `test/diagram-anchors.test.ts` | **Create** | Unit tests for pure parser functions |
| `package.json` | **Modify** | Add `tsx` to devDependencies |

---

## Task 1: Add `tsx` and write pure parser tests (TDD setup)

**Files:**
- Modify: `package.json`
- Create: `test/diagram-anchors.test.ts`

- [ ] **Step 1: Add `tsx` to devDependencies**

In `package.json`, add to `"devDependencies"`:
```json
"tsx": "^4.7.0"
```

Add a `"test"` script:
```json
"test": "npx tsx test/diagram-anchors.test.ts"
```

- [ ] **Step 2: Write failing tests for the three pure functions**

Create `test/diagram-anchors.test.ts`:
```typescript
import assert from 'node:assert/strict';
import { detectDiagramType, extractFlowchartNodeId, extractSequenceActor } from '../webview/diagram-anchors';

// detectDiagramType
assert.equal(detectDiagramType('flowchart TD\nA --> B'), 'flowchart');
assert.equal(detectDiagramType('flowchart LR\nA --> B'), 'flowchart');
assert.equal(detectDiagramType('graph TD\nA --> B'), 'flowchart');
assert.equal(detectDiagramType('graph LR\nA --> B'), 'flowchart');
assert.equal(detectDiagramType('sequenceDiagram\nA->>B: hi'), 'sequence');
assert.equal(detectDiagramType('  sequenceDiagram\nA->>B: hi'), 'sequence');
assert.equal(detectDiagramType('pie title Pets\n"Dogs": 40'), 'unknown');
assert.equal(detectDiagramType(''), 'unknown');

// extractFlowchartNodeId
assert.equal(extractFlowchartNodeId('    A[Open markdown file]'), 'A');
assert.equal(extractFlowchartNodeId('    B --> C'), 'B');
assert.equal(extractFlowchartNodeId('    C{Decision?}'), 'C');
assert.equal(extractFlowchartNodeId('    D(rounded)'), 'D');
assert.equal(extractFlowchartNodeId('    B -->|yes| C'), 'B');
assert.equal(extractFlowchartNodeId('    style A fill:#fff'), 'style');
assert.equal(extractFlowchartNodeId(''), null);
assert.equal(extractFlowchartNodeId('    '), null);

// extractSequenceActor
assert.equal(extractSequenceActor('    participant User'), 'User');
assert.equal(extractSequenceActor('    actor GitHub'), 'GitHub');
assert.equal(extractSequenceActor('    User->>Extension: Fetch PR comments'), 'User');
assert.equal(extractSequenceActor('    Extension-->>User: Return comment list'), 'Extension');
assert.equal(extractSequenceActor('    User->>Extension: Open Review Panel'), 'User');
assert.equal(extractSequenceActor('    Note over User: text'), null);
assert.equal(extractSequenceActor('    loop Every second'), null);
assert.equal(extractSequenceActor(''), null);

console.log('All diagram-anchors tests passed ✓');
```

- [ ] **Step 3: Run tests — confirm they fail with "Cannot find module"**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npm install && npx tsx test/diagram-anchors.test.ts
```

Expected: `Error: Cannot find module '../webview/diagram-anchors'`

---

## Task 2: Create `webview/diagram-anchors.ts` — pure functions

**Files:**
- Create: `webview/diagram-anchors.ts`

- [ ] **Step 1: Write the pure functions that make the tests pass**

Create `webview/diagram-anchors.ts`:
```typescript
import type { PRComment } from '../src/types';

export type Point = { x: number; y: number };
export type DiagramType = 'flowchart' | 'sequence' | 'unknown';

export function detectDiagramType(source: string): DiagramType {
  const first = source.trimStart().toLowerCase();
  if (first.startsWith('flowchart') || first.startsWith('graph ')) return 'flowchart';
  if (first.startsWith('sequencediagram')) return 'sequence';
  return 'unknown';
}

export function extractFlowchartNodeId(sourceLine: string): string | null {
  const m = sourceLine.trim().match(/^([A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}

export function extractSequenceActor(sourceLine: string): string | null {
  const decl = sourceLine.trim().match(/^(?:participant|actor)\s+(\S+)/i);
  if (decl) return decl[1];
  const msg = sourceLine.trim().match(/^(\S+?)(?:[-~][-~>)]+)/);
  if (msg) return msg[1];
  return null;
}
```

- [ ] **Step 2: Run tests — confirm they pass**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npx tsx test/diagram-anchors.test.ts
```

Expected: `All diagram-anchors tests passed ✓`

- [ ] **Step 3: Commit**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && git add package.json package-lock.json test/diagram-anchors.test.ts webview/diagram-anchors.ts && git commit -m "feat: diagram-anchors pure parser functions with tests"
```

---

## Task 3: Complete `diagram-anchors.ts` — DOM queries and fallback chain

**Files:**
- Modify: `webview/diagram-anchors.ts`

These functions use DOM APIs so they cannot be unit-tested; they will be verified in Task 7.

- [ ] **Step 1: Append DOM-querying helpers and `resolveDiagramAnchors` to `diagram-anchors.ts`**

Add to the bottom of `webview/diagram-anchors.ts`:
```typescript
// ─── DOM helpers (not unit-testable; verified manually in Task 7) ─────────────

function findAnchorForLine(container: HTMLElement, line: number): HTMLElement | null {
  const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-line]'));
  let best: HTMLElement | null = null;
  let bestLine = -1;
  for (const el of elements) {
    const elLine = parseInt(el.dataset['line']!, 10);
    if (elLine < line && elLine > bestLine) { best = el; bestLine = elLine; }
  }
  return best;
}

function findFlowchartElement(diagramEl: HTMLElement, nodeId: string): Element | null {
  return diagramEl.querySelector(`[id^="flowchart-${nodeId}-"]`);
}

function findSequenceElement(
  diagramEl: HTMLElement,
  actorName: string,
  source: string,
  relLine: number
): Element | null {
  // Try to match actor by visible text label
  for (const textEl of diagramEl.querySelectorAll('text')) {
    if (textEl.textContent?.trim() === actorName) return textEl;
  }
  // Count message index up to relLine, then pick the Nth messageText element
  const MSG_RE = /^\s*\S+[-~]+[>)]+/;
  const lines = source.split('\n');
  let msgIdx = 0;
  for (let i = 0; i < relLine; i++) {
    if (MSG_RE.test(lines[i] ?? '')) msgIdx++;
  }
  if (MSG_RE.test(lines[relLine] ?? '')) {
    const msgs = diagramEl.querySelectorAll('text.messageText, .messageText');
    return (msgs[msgIdx] as Element | undefined) ?? null;
  }
  return null;
}

function textSearchElement(diagramEl: HTMLElement, sourceLine: string): Element | null {
  // Strip common mermaid syntax, keep label text
  const cleaned = sourceLine
    .replace(/^\s*[A-Za-z0-9_]+\s*(?:-->|-.->|==>)[^:]*/, '')
    .replace(/[\[\](){}<>|#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 3) return null;
  for (const textEl of diagramEl.querySelectorAll('text, tspan')) {
    if ((textEl.textContent?.trim() ?? '').includes(cleaned)) return textEl;
  }
  return null;
}

function elementToPoint(element: Element, container: HTMLElement): Point {
  const eRect = element.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  return {
    x: eRect.right - cRect.left,
    y: eRect.top - cRect.top + eRect.height / 2,
  };
}

function proportionalPoint(
  diagramEl: HTMLElement,
  relLine: number,
  totalLines: number
): Point | null {
  const svgEl = diagramEl.querySelector('svg');
  if (!svgEl) return null;
  const svgRect = svgEl.getBoundingClientRect();
  const cRect = diagramEl.getBoundingClientRect();
  const t = totalLines > 1 ? Math.max(0, Math.min(1, relLine / (totalLines - 1))) : 0;
  return {
    x: svgRect.right - cRect.left - 8,
    y: svgRect.top - cRect.top + t * svgRect.height,
  };
}

function cornerPoint(diagramEl: HTMLElement): Point {
  const target = diagramEl.querySelector('svg') ?? diagramEl;
  const rect = target.getBoundingClientRect();
  const cRect = diagramEl.getBoundingClientRect();
  return {
    x: rect.right - cRect.left - 8,
    y: rect.top - cRect.top + 8,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function resolveDiagramAnchors(
  container: HTMLElement,
  comments: PRComment[],
  sourceMap: Map<HTMLElement, string>
): Map<number, Point> {
  const result = new Map<number, Point>();

  // Only process root comments (no in_reply_to_id)
  for (const comment of comments) {
    if (comment.in_reply_to_id) continue;

    const anchor = findAnchorForLine(container, comment.line);
    if (!anchor || !anchor.classList.contains('mermaid')) continue;

    const source = sourceMap.get(anchor) ?? '';
    // markdown-it map is 0-indexed; data-line stores map[0] (the fence open line, 0-indexed).
    // GitHub comment.line is 1-indexed. The first diagram source line is at 1-indexed line
    // (blockStartLine + 1) + 1 = blockStartLine + 2.
    // relLine = comment.line - blockStartLine - 2  (0-indexed into source body lines)
    const blockStartLine = parseInt(anchor.dataset['line'] ?? '0', 10);
    const relLine = comment.line - blockStartLine - 2;
    const sourceLines = source.split('\n');
    const sourceLine = sourceLines[Math.max(0, relLine)] ?? '';
    const totalLines = sourceLines.length;

    const type = detectDiagramType(source);
    let point: Point | null = null;

    // 1. Type-aware
    if (type === 'flowchart') {
      const nodeId = extractFlowchartNodeId(sourceLine);
      if (nodeId) {
        const el = findFlowchartElement(anchor, nodeId);
        if (el) point = elementToPoint(el, anchor);
      }
    } else if (type === 'sequence') {
      const actorName = extractSequenceActor(sourceLine);
      if (actorName) {
        const el = findSequenceElement(anchor, actorName, source, relLine);
        if (el) point = elementToPoint(el, anchor);
      }
    }

    // 2. Text search
    if (!point) {
      const el = textSearchElement(anchor, sourceLine);
      if (el) point = elementToPoint(el, anchor);
    }

    // 3. Proportional Y
    if (!point) point = proportionalPoint(anchor, relLine, totalLines);

    // 4. Corner
    result.set(comment.id, point ?? cornerPoint(anchor));
  }

  return result;
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npx tsc --noEmit -p tsconfig.webview.json 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to this file).

- [ ] **Step 3: Commit**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && git add webview/diagram-anchors.ts && git commit -m "feat: diagram-anchors DOM queries and fallback chain"
```

---

## Task 4: Refactor `thread.ts` — extract `buildPanel`, add popover placement

**Files:**
- Modify: `webview/thread.ts`

- [ ] **Step 1: Add `placement` to `ThreadOptions` and extract `buildPanel`**

In `webview/thread.ts`, change `ThreadOptions` to:
```typescript
export interface ThreadOptions {
  onReply?: OnReply;
  threadNodeId?: string;
  isResolved?: boolean;
  currentUserLogin?: string;
  onResolve?: (nodeId: string) => void;
  onUnresolve?: (nodeId: string) => void;
  onEdit?: (commentId: number, newBody: string) => void;
  onDelete?: (commentId: number) => void;
  placement?: 'inline' | 'popover';
}
```

Extract the panel-building body of `toggleThread` into a private `buildPanel` function. Replace the body of `toggleThread` with a call to `buildPanel` plus dispatch on `placement`. The full new `toggleThread` and new `buildPanel` (showing the complete functions):

```typescript
function buildPanel(comments: PRComment[], threadId: number, options?: ThreadOptions): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'pr-thread';
  panel.dataset.threadFor = String(threadId);

  if (options?.isResolved) {
    const banner = document.createElement('div');
    banner.className = 'pr-thread-resolved-banner';
    banner.textContent = '✓ Resolved conversation';
    panel.appendChild(banner);
  }

  for (const comment of comments) {
    const item = document.createElement('div');
    item.className = 'pr-thread-item';

    const header = document.createElement('div');
    header.className = 'pr-thread-header';

    const avatar = document.createElement('img');
    avatar.src = comment.user.avatar_url;
    avatar.alt = comment.user.login;
    avatar.className = 'pr-thread-avatar';

    const login = document.createElement('strong');
    login.textContent = comment.user.login;

    const time = document.createElement('time');
    time.textContent = new Date(comment.created_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    time.title = new Date(comment.created_at).toLocaleString();

    header.appendChild(avatar);
    header.appendChild(login);
    header.appendChild(time);

    const body = document.createElement('div');
    body.className = 'pr-thread-body';
    body.innerHTML = renderMarkdown(comment.body);

    item.appendChild(header);
    item.appendChild(body);

    if (options?.currentUserLogin && comment.user.login === options.currentUserLogin) {
      addDotMenu(item, comment, body, options);
    }

    panel.appendChild(item);
  }

  const footer = document.createElement('div');
  footer.className = 'pr-thread-footer';
  footer.style.display = 'flex';
  footer.style.gap = '6px';
  footer.style.marginTop = '8px';

  if (options?.onReply) {
    const replyBtn = document.createElement('button');
    replyBtn.className = 'pr-reply-btn';
    replyBtn.textContent = 'Reply';
    replyBtn.addEventListener('click', () => {
      const rootComment = comments.find(c => !c.in_reply_to_id) ?? comments[0];
      options.onReply!(panel, rootComment.id, rootComment.line);
    });
    footer.appendChild(replyBtn);
  }

  if (options?.threadNodeId) {
    if (options.isResolved) {
      const unresolveBtn = document.createElement('button');
      unresolveBtn.className = 'pr-resolve-btn';
      unresolveBtn.textContent = 'Unresolve';
      unresolveBtn.addEventListener('click', () => {
        unresolveBtn.disabled = true;
        unresolveBtn.textContent = 'Unresolving…';
        options.onUnresolve?.(options.threadNodeId!);
      });
      footer.appendChild(unresolveBtn);
    } else {
      const resolveBtn = document.createElement('button');
      resolveBtn.className = 'pr-resolve-btn';
      resolveBtn.textContent = 'Resolve conversation';
      resolveBtn.addEventListener('click', () => {
        resolveBtn.disabled = true;
        resolveBtn.textContent = 'Resolving…';
        options.onResolve?.(options.threadNodeId!);
      });
      footer.appendChild(resolveBtn);
    }
  }

  panel.appendChild(footer);
  return panel;
}

export function toggleThread(
  bubble: HTMLElement,
  comments: PRComment[],
  threadId: number,
  options?: ThreadOptions
): void {
  const existing = document.querySelector(`[data-thread-for="${threadId}"]`);
  if (existing) {
    (existing.closest('.pr-popover') ?? existing.closest('.pr-table-thread-row') ?? existing).remove();
    return;
  }

  const panel = buildPanel(comments, threadId, options);

  if (options?.placement === 'popover') {
    showAsPopover(bubble, panel);
    return;
  }

  const parent = bubble.closest('[data-line]') as HTMLElement | null;
  if (!parent) return;
  if (!insertAfterInTable(parent, panel)) {
    parent.insertAdjacentElement('afterend', panel);
  }
}
```

- [ ] **Step 2: Add `showAsPopover` after `buildPanel`**

Add this function to `webview/thread.ts` (before `toggleThread`):
```typescript
function showAsPopover(bubble: HTMLElement, panel: HTMLElement): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'pr-popover';

  const arrow = document.createElement('div');
  wrapper.appendChild(arrow);
  wrapper.appendChild(panel);
  document.body.appendChild(wrapper);

  // Position after appending so getBoundingClientRect is accurate
  const bubbleRect = bubble.getBoundingClientRect();
  const wRect = wrapper.getBoundingClientRect();
  const GAP = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = bubbleRect.right + GAP;
  let arrowClass = 'pr-popover-arrow pr-popover-arrow--left';

  if (left + wRect.width > vw - GAP) {
    left = bubbleRect.left - wRect.width - GAP;
    arrowClass = 'pr-popover-arrow pr-popover-arrow--right';
  }

  const top = Math.max(GAP, Math.min(
    bubbleRect.top + bubbleRect.height / 2 - wRect.height / 2,
    vh - wRect.height - GAP
  ));

  wrapper.style.cssText = `position:fixed;z-index:9999;left:${left}px;top:${top}px;`;
  arrow.className = arrowClass;
  arrow.style.cssText = `top:${bubbleRect.top + bubbleRect.height / 2 - top - 5}px;`;

  const dismiss = (e: MouseEvent): void => {
    if (!wrapper.contains(e.target as Node) && e.target !== bubble) {
      wrapper.remove();
      document.removeEventListener('click', dismiss);
    }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npx tsc --noEmit -p tsconfig.webview.json 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && git add webview/thread.ts && git commit -m "feat: thread popover placement mode"
```

---

## Task 5: Add popover CSS to `ReviewPanel.ts`

**Files:**
- Modify: `src/ReviewPanel.ts` (the `<style>` block, currently ending around line 629)

- [ ] **Step 1: Insert popover styles before `</style>`**

Find the line containing `</style>` in `ReviewPanel.ts` (currently around line 629) and insert these styles immediately before it:

```css
    .pr-popover {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.18));
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      max-width: 360px;
      min-width: 240px;
      max-height: 60vh;
      overflow-y: auto;
      padding: 10px 12px;
    }
    .pr-popover-arrow--left,
    .pr-popover-arrow--right {
      position: absolute;
      width: 0;
      height: 0;
    }
    .pr-popover-arrow--left {
      left: -6px;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-right: 6px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.18));
    }
    .pr-popover-arrow--right {
      right: -6px;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 6px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.18));
    }
```

- [ ] **Step 2: Verify compilation**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && git add src/ReviewPanel.ts && git commit -m "feat: popover CSS styles"
```

---

## Task 6: Modify `overlay.ts` — absolute positioning for diagram bubbles

**Files:**
- Modify: `webview/overlay.ts`

- [ ] **Step 1: Add `Point` import and `diagramAnchors` param, update `placeOverlays`**

At the top of `webview/overlay.ts`, add the import:
```typescript
import type { Point } from './diagram-anchors';
```

Change the `placeOverlays` signature and body. The key changes are:
1. Add `diagramAnchors?: Map<number, Point>` parameter
2. Clean up any open popovers at the start
3. Pass `isDiagram` flag to `createBubble`
4. Add the diagram branch (absolute positioning) before the existing `tr`/`li`/default branches

Replace the `placeOverlays` function with:
```typescript
export function placeOverlays(
  container: HTMLElement,
  comments: PRComment[],
  threadMeta: ThreadMeta[],
  callbacks?: OverlayCallbacks,
  diagramAnchors?: Map<number, Point>
): void {
  container.querySelectorAll('.pr-bubble, .pr-bubble-cell, .pr-thread, .pr-table-thread-row').forEach(el => el.remove());
  document.querySelectorAll('.pr-popover').forEach(el => el.remove());
  if (comments.length === 0) return;
  const threads = buildThreads(comments);
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
}
```

- [ ] **Step 2: Add `isDiagram` parameter to `createBubble` and pass `placement: 'popover'`**

Change the `createBubble` signature:
```typescript
function createBubble(
  thread: Thread,
  meta: ThreadMeta | undefined,
  callbacks?: OverlayCallbacks,
  isDiagram = false
): HTMLElement {
```

Inside `createBubble`, update the `options` object passed to `toggleThread` to include `placement`:
```typescript
  const options: ThreadOptions = {
    onReply: callbacks?.onReply,
    threadNodeId: meta?.nodeId,
    isResolved,
    currentUserLogin: callbacks?.currentUserLogin,
    onResolve: callbacks?.onResolve,
    onUnresolve: callbacks?.onUnresolve,
    onEdit: callbacks?.onEdit,
    onDelete: callbacks?.onDelete,
    placement: isDiagram ? 'popover' : 'inline',
  };
```

- [ ] **Step 3: Verify compilation**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npx tsc --noEmit -p tsconfig.webview.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && git add webview/overlay.ts && git commit -m "feat: overlay absolute positioning for diagram bubbles"
```

---

## Task 7: Wire up in `main.ts`

**Files:**
- Modify: `webview/main.ts`

- [ ] **Step 1: Add import and mutable anchor map**

At the top of `webview/main.ts`, add:
```typescript
import { resolveDiagramAnchors, type Point } from './diagram-anchors';
```

Add a module-level variable alongside the others (`allComments`, etc.):
```typescript
let diagramAnchors: Map<number, Point> = new Map();
```

- [ ] **Step 2: Capture mermaid sources and call resolver in `handleRender`**

In `handleRender`, find the existing block:
```typescript
  const mermaidNodes = contentEl.querySelectorAll<HTMLElement>('.mermaid');
  if (mermaidNodes.length > 0) {
    await mermaid.run({ nodes: mermaidNodes });
  }

  placeOverlays(contentEl, allComments, allThreadMeta, buildCallbacks());
```

Replace it with:
```typescript
  const mermaidNodes = contentEl.querySelectorAll<HTMLElement>('.mermaid');
  const mermaidSources = new Map<HTMLElement, string>();
  mermaidNodes.forEach(el => mermaidSources.set(el, el.textContent?.trim() ?? ''));

  if (mermaidNodes.length > 0) {
    await mermaid.run({ nodes: mermaidNodes });
  }

  diagramAnchors = resolveDiagramAnchors(contentEl, allComments, mermaidSources);
  placeOverlays(contentEl, allComments, allThreadMeta, buildCallbacks(), diagramAnchors);
```

- [ ] **Step 3: Pass `diagramAnchors` in `placeOverlaysKeepOpen`**

Find `placeOverlaysKeepOpen`:
```typescript
function placeOverlaysKeepOpen(): void {
  placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
```

Change to:
```typescript
function placeOverlaysKeepOpen(): void {
  placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks(), diagramAnchors);
```

- [ ] **Step 4: Verify compilation**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npx tsc --noEmit -p tsconfig.webview.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && git add webview/main.ts && git commit -m "feat: wire diagram anchor resolution into render pipeline"
```

---

## Task 8: Build and manual verification

**Files:**
- None

- [ ] **Step 1: Build**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npm run compile 2>&1 | tail -5
```

Expected: exits with code 0, `dist/webview.js` and `dist/extension.js` updated.

- [ ] **Step 2: Open test fixture in the extension**

1. Open `test/fixtures/pr-review-test.md` in VS Code
2. Open a PR that has comments on the `## Mermaid Flowchart` section — specifically a comment on one of the node lines (e.g. the `C{...}` or `A[Open markdown file]` line)
3. Run "Markdown PR Review: Open Review Panel"

Expected behavior:
- Bubble appears near the commented node inside the diagram (not below it)
- Clicking the bubble opens a popover to the right of the bubble (flips left if near right edge)
- Popover shows the thread with Reply / Resolve buttons
- Clicking outside the popover dismisses it
- Clicking the bubble again also dismisses it

- [ ] **Step 3: Verify sequence diagram**

Open a PR with a comment on an actor or message line in `## Mermaid Sequence Diagram`.

Expected: bubble appears near the sender actor column, popover opens correctly.

- [ ] **Step 4: Verify fallbacks**

Comment on a `style` line or `classDef` line in a flowchart (no matching node). Expected: bubble appears proportionally down the right edge of the diagram, or at corner if relLine is out of bounds.

- [ ] **Step 5: Verify re-render stability**

Open a thread popover, switch to another file in the dropdown and back. Expected: popovers from the previous render are closed; the re-rendered diagram shows bubbles at the same positions.

- [ ] **Step 6: Commit if any fixes were needed, then final build**

```bash
cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review" && npm run compile && git add -p && git commit -m "fix: diagram anchor adjustments from manual verification"
```

---

## Notes for Implementation

**`relLine` offset verification:** The formula `comment.line - blockStartLine - 2` assumes markdown-it's `token.map[0]` is 0-indexed and equals the fence-open line minus 1. Verify this with a known comment: if `data-line="61"` and GitHub reports `comment.line=63`, then `relLine = 63 - 61 - 2 = 0` (first source line). Log `relLine` and `sourceLine` to the browser console during Task 8 to confirm.

**Mermaid SVG node ID format:** Mermaid 10 uses `flowchart-NODEID-N` where N is a global render counter. If diagrams are re-rendered (e.g. theme switch), N increments. The `[id^="flowchart-NODEID-"]` prefix query handles this correctly.

**Sequence diagram SVG variance:** The exact class names for message text (`text.messageText` vs `.messageText`) depend on the Mermaid version. If the message-count fallback doesn't work, inspect the rendered SVG in DevTools to find the correct selector.
