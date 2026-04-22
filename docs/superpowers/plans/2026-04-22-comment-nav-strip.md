# Comment Nav Strip + Thread Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky header strip showing comment count with Expand All / Close All controls and ↑/↓ navigation, and make open thread state survive tab switches.

**Architecture:** A new `NavStrip` class (`webview/nav.ts`) owns the left and right zones of `#review-header`. `main.ts` gains an `openThreadIds` Set to track which threads are open; `overlay.ts` calls a new `onThreadToggle` callback whenever a bubble is clicked. On tab-switch re-render, `main.ts` re-clicks the surviving bubbles to restore open state.

**Tech Stack:** TypeScript, browser DOM, VS Code webview CSS variables, CSS `@keyframes` animation.

---

## File Map

| File | Role |
|------|------|
| `webview/nav.ts` | **New.** `NavStrip` class — renders and manages the entire `#review-header` strip (count badge, Expand All, Close All, ↑/counter/↓). Holds its own navigation index. |
| `webview/overlay.ts` | **Modify.** Add `onThreadToggle` to `OverlayCallbacks`; call it in bubble click handler. |
| `webview/main.ts` | **Modify.** Add `openThreadIds` Set, `navStrip` instance; wire `onThreadToggle` to update Set; re-open threads after re-render; add `[`/`]` keyboard shortcuts; call `navStrip.update()` after each render/mutation. |
| `src/ReviewPanel.ts` | **Modify.** Add `@keyframes pr-nav-highlight` CSS and `.pr-nav-highlight` rule; change `#review-header` from `justify-content: flex-end` to `justify-content: space-between` to accommodate NavStrip zones alongside the DraftManager badge. |

---

## Task 1: Add `onThreadToggle` to `overlay.ts`

**Files:**
- Modify: `webview/overlay.ts:10-17` (OverlayCallbacks interface)
- Modify: `webview/overlay.ts:93-98` (bubble click handler in `createBubble`)

- [ ] **Step 1: Add `onThreadToggle` to the `OverlayCallbacks` interface**

  In `webview/overlay.ts`, the current interface ends at line 17. Add one optional field:

  ```typescript
  export interface OverlayCallbacks {
    onReply?: OnReply;
    currentUserLogin?: string;
    onResolve?: (threadNodeId: string) => void;
    onUnresolve?: (threadNodeId: string) => void;
    onEdit?: (commentId: number, newBody: string) => void;
    onDelete?: (commentId: number) => void;
    onThreadToggle?: (rootId: number, isOpen: boolean) => void;
  }
  ```

- [ ] **Step 2: Call `onThreadToggle` in the bubble click handler**

  The bubble click handler is at lines 93–98 in `createBubble`. Replace it with:

  ```typescript
  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !document.querySelector(`[data-thread-for="${thread.rootId}"]`);
    toggleThread(bubble, thread.comments, thread.rootId, options);
    callbacks?.onThreadToggle?.(thread.rootId, isOpen);
  });
  ```

  `isOpen` is computed *before* `toggleThread` runs: if no panel exists yet, the click will open it → `isOpen = true`. If a panel already exists, the click will close it → `isOpen = false`.

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review"
  npx tsc -p tsconfig.webview.json --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 4: Commit**

  ```bash
  git add webview/overlay.ts
  git commit -m "feat: add onThreadToggle callback to OverlayCallbacks"
  ```

---

## Task 2: Create `webview/nav.ts` — NavStrip class

**Files:**
- Create: `webview/nav.ts`

- [ ] **Step 1: Create the file with the full NavStrip implementation**

  ```typescript
  export class NavStrip {
    private readonly _header: HTMLElement;
    private readonly _bubbleProvider: () => HTMLElement[];
    private readonly _onCloseAll: () => void;
    private _currentIndex = 0;
    private _stripEl: HTMLElement | null = null;
    private _counterEl: HTMLElement | null = null;
    private _countBadgeEl: HTMLElement | null = null;

    constructor(
      header: HTMLElement,
      bubbleProvider: () => HTMLElement[],
      onCloseAll: () => void
    ) {
      this._header = header;
      this._bubbleProvider = bubbleProvider;
      this._onCloseAll = onCloseAll;
    }

    update(totalComments: number): void {
      this._currentIndex = 0;
      if (totalComments === 0) {
        this._stripEl?.remove();
        this._stripEl = null;
        this._counterEl = null;
        this._countBadgeEl = null;
        return;
      }
      if (!this._stripEl) {
        this._render();
      }
      this._refreshBadge(totalComments);
      this._refreshCounter();
    }

    next(): void {
      const bubbles = this._bubbleProvider();
      if (bubbles.length === 0) return;
      this._currentIndex = (this._currentIndex + 1) % bubbles.length;
      this._navigateTo(bubbles[this._currentIndex]);
      this._refreshCounter();
    }

    prev(): void {
      const bubbles = this._bubbleProvider();
      if (bubbles.length === 0) return;
      this._currentIndex = (this._currentIndex - 1 + bubbles.length) % bubbles.length;
      this._navigateTo(bubbles[this._currentIndex]);
      this._refreshCounter();
    }

    private _render(): void {
      const strip = document.createElement('div');
      strip.className = 'pr-nav-strip';

      const left = document.createElement('span');
      left.className = 'pr-nav-left';

      const countBadge = document.createElement('span');
      countBadge.className = 'pr-nav-count';

      const expandAllBtn = document.createElement('button');
      expandAllBtn.className = 'pr-nav-btn';
      expandAllBtn.textContent = 'Expand All';
      expandAllBtn.addEventListener('click', () => this._expandAll());

      const closeAllBtn = document.createElement('button');
      closeAllBtn.className = 'pr-nav-btn';
      closeAllBtn.textContent = 'Close All';
      closeAllBtn.addEventListener('click', () => this._closeAll());

      left.appendChild(countBadge);
      left.appendChild(expandAllBtn);
      left.appendChild(closeAllBtn);

      const right = document.createElement('span');
      right.className = 'pr-nav-right';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'pr-nav-btn';
      prevBtn.textContent = '↑';
      prevBtn.title = 'Previous comment ([)';
      prevBtn.addEventListener('click', () => this.prev());

      const counterEl = document.createElement('span');
      counterEl.className = 'pr-nav-counter';

      const nextBtn = document.createElement('button');
      nextBtn.className = 'pr-nav-btn';
      nextBtn.textContent = '↓';
      nextBtn.title = 'Next comment (])';
      nextBtn.addEventListener('click', () => this.next());

      right.appendChild(prevBtn);
      right.appendChild(counterEl);
      right.appendChild(nextBtn);

      strip.appendChild(left);
      strip.appendChild(right);

      this._header.prepend(strip);
      this._stripEl = strip;
      this._counterEl = counterEl;
      this._countBadgeEl = countBadge;
    }

    private _refreshBadge(totalComments: number): void {
      if (!this._countBadgeEl) return;
      this._countBadgeEl.textContent = `● ${totalComments} comment${totalComments !== 1 ? 's' : ''}`;
    }

    private _refreshCounter(): void {
      if (!this._counterEl) return;
      const total = this._bubbleProvider().length;
      if (total === 0) {
        this._counterEl.textContent = '';
        return;
      }
      this._counterEl.textContent = `${this._currentIndex + 1} / ${total}`;
    }

    private _navigateTo(bubble: HTMLElement): void {
      const anchor = bubble.closest('[data-line]') as HTMLElement | null;
      if (!anchor) return;
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      anchor.classList.remove('pr-nav-highlight');
      void anchor.offsetWidth; // force reflow so animation restarts on rapid calls
      anchor.classList.add('pr-nav-highlight');
      anchor.addEventListener('animationend', () => anchor.classList.remove('pr-nav-highlight'), { once: true });
    }

    private _expandAll(): void {
      this._bubbleProvider().forEach(bubble => {
        const threadId = bubble.dataset.threadId;
        if (threadId && !document.querySelector(`[data-thread-for="${threadId}"]`)) {
          bubble.click();
        }
      });
    }

    private _closeAll(): void {
      document.querySelectorAll<HTMLElement>('[data-thread-for]').forEach(el => el.remove());
      this._onCloseAll();
    }
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review"
  npx tsc -p tsconfig.webview.json --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 3: Commit**

  ```bash
  git add webview/nav.ts
  git commit -m "feat: add NavStrip class for comment navigation header"
  ```

---

## Task 3: Wire NavStrip and thread persistence in `webview/main.ts`

**Files:**
- Modify: `webview/main.ts`

The current `placeOverlaysKeepOpen()` function at lines 30–41 queries the DOM to find open thread IDs. We're replacing that ad-hoc approach with a proper `openThreadIds` Set maintained via `onThreadToggle`.

- [ ] **Step 1: Add module-level state and import NavStrip**

  At the top of `webview/main.ts`, add the import and two new module-level variables. Place the import alongside the existing imports, and the variables alongside `allComments` etc.:

  ```typescript
  import { NavStrip } from './nav';
  ```

  ```typescript
  let openThreadIds: Set<number> = new Set();
  let navStrip: NavStrip | undefined;
  ```

- [ ] **Step 2: Replace `placeOverlaysKeepOpen()` with a version that uses `openThreadIds`**

  The current function (lines 30–41) reads open IDs from the DOM before re-rendering. Replace the entire function:

  ```typescript
  function placeOverlaysKeepOpen(): void {
    placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
    navStrip?.update(countThreads());
    document.querySelectorAll<HTMLElement>('[data-thread-id]').forEach(bubble => {
      if (openThreadIds.has(Number(bubble.dataset.threadId))) bubble.click();
    });
  }

  function countThreads(): number {
    return document.querySelectorAll<HTMLElement>('[data-thread-id]').length;
  }
  ```

- [ ] **Step 3: Add `onThreadToggle` to `buildCallbacks()`**

  Inside `buildCallbacks()`, after the existing `onUnresolve` entry, add:

  ```typescript
  onThreadToggle: (rootId, isOpen) => {
    if (isOpen) {
      openThreadIds.add(rootId);
    } else {
      openThreadIds.delete(rootId);
    }
  },
  ```

- [ ] **Step 4: Initialize NavStrip in `handleRender` and re-open persisted threads**

  In `handleRender`, after `placeOverlays(contentEl, allComments, allThreadMeta, buildCallbacks())` and before the `draft` setup block, add:

  ```typescript
  const header = document.getElementById('review-header')!;
  if (!navStrip) {
    navStrip = new NavStrip(
      header,
      () => Array.from(document.querySelectorAll<HTMLElement>('[data-thread-id]')),
      () => { openThreadIds.clear(); }
    );
  }
  navStrip.update(countThreads());

  // Re-open threads that were open before the tab switch (filtered to bubbles present in DOM)
  document.querySelectorAll<HTMLElement>('[data-thread-id]').forEach(bubble => {
    if (openThreadIds.has(Number(bubble.dataset.threadId))) bubble.click();
  });
  ```

  Also remove the existing `const header = document.getElementById('review-header')!;` line (currently at line 216 in the file — it's used only by `DraftManager`) and replace the `DraftManager` initialization to use `header` from the block above:

  ```typescript
  draft?.clear();
  draft = new DraftManager(vscode, header);
  ```

  The full updated section in `handleRender` after `placeOverlays` should look like:

  ```typescript
  placeOverlays(contentEl, allComments, allThreadMeta, buildCallbacks());

  const header = document.getElementById('review-header')!;
  if (!navStrip) {
    navStrip = new NavStrip(
      header,
      () => Array.from(document.querySelectorAll<HTMLElement>('[data-thread-id]')),
      () => { openThreadIds.clear(); }
    );
  }
  navStrip.update(countThreads());

  document.querySelectorAll<HTMLElement>('[data-thread-id]').forEach(bubble => {
    if (openThreadIds.has(Number(bubble.dataset.threadId))) bubble.click();
  });

  draft?.clear();
  draft = new DraftManager(vscode, header);
  ```

- [ ] **Step 5: Add `[` / `]` keyboard shortcuts**

  Add a `keydown` listener once, near the `vscode.postMessage({ type: 'ready' })` line at the bottom of the module-level setup (outside of `handleRender`). Place it just before `window.addEventListener('message', ...)`:

  ```typescript
  document.addEventListener('keydown', (e) => {
    if ((e.target as Element).closest('textarea, input')) return;
    if (e.key === '[') { e.preventDefault(); navStrip?.prev(); }
    if (e.key === ']') { e.preventDefault(); navStrip?.next(); }
  });
  ```

- [ ] **Step 6: Verify TypeScript compiles**

  ```bash
  cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review"
  npx tsc -p tsconfig.webview.json --noEmit
  ```

  Expected: zero errors.

- [ ] **Step 7: Commit**

  ```bash
  git add webview/main.ts
  git commit -m "feat: wire NavStrip and open-thread persistence in main.ts"
  ```

---

## Task 4: Add highlight CSS and nav strip styles to `src/ReviewPanel.ts`

**Files:**
- Modify: `src/ReviewPanel.ts:205-218` (`#review-header` rule and surrounding styles)

- [ ] **Step 1: Change `#review-header` justify-content and add nav strip + highlight CSS**

  The current `#review-header` rule (lines 206–218 in `ReviewPanel.ts`) has `justify-content: flex-end`. The NavStrip prepends a `div.pr-nav-strip` which uses its own `space-between` layout for left/right zones, but the header itself should stay `flex-end` so the DraftManager badge continues to float right when there are no comments (no strip). When the strip is present it takes up the full row already. No change needed to `#review-header` justify-content.

  Instead, add the following CSS rules to the `<style>` block in `_buildHtml()`, after the `.pr-resolved` rule (around line 355):

  ```css
  .pr-nav-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-right: 12px;
  }
  .pr-nav-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pr-nav-right {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .pr-nav-count {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 11px;
  }
  .pr-nav-btn {
    background: rgba(255,255,255,0.08);
    border: none;
    color: var(--vscode-editor-foreground);
    border-radius: 3px;
    padding: 2px 8px;
    font-size: 12px;
    cursor: pointer;
    line-height: 1.4;
  }
  .pr-nav-btn:hover { background: rgba(255,255,255,0.15); }
  .pr-nav-counter {
    opacity: 0.6;
    font-size: 11px;
    min-width: 36px;
    text-align: center;
  }
  @keyframes pr-nav-highlight {
    0%   { outline: 2px solid var(--vscode-focusBorder, #007acc); }
    100% { outline: 2px solid transparent; }
  }
  .pr-nav-highlight {
    animation: pr-nav-highlight 600ms ease-out forwards;
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles (full project)**

  ```bash
  cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review"
  npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.webview.json --noEmit
  ```

  Expected: zero errors from both configs.

- [ ] **Step 3: Commit**

  ```bash
  git add src/ReviewPanel.ts
  git commit -m "feat: add nav strip styles and highlight keyframe animation"
  ```

---

## Task 5: Build and smoke-test

- [ ] **Step 1: Build the extension**

  ```bash
  cd "/Users/fxl/Library/Mobile Documents/com~apple~CloudDocs/Projects/markdown-pr-review"
  node esbuild.mjs
  ```

  Expected: `dist/webview.js` and `dist/extension.js` produced without errors.

- [ ] **Step 2: Manual test — nav strip appears**

  1. Open VS Code with the extension loaded (Run Extension from the debug panel, or install the `.vsix`).
  2. Open a markdown file from a PR that has comments.
  3. Run "Open PR Review".
  4. **Verify:** `#review-header` shows `● N comments   Expand All   Close All` on the left and `↑  1 / N  ↓` on the right.
  5. **Verify:** When the PR has zero comments, the header is empty (hidden by `:empty` rule — note: NavStrip removes its strip element when `update(0)` is called, so the header will only contain the DraftManager badge if any drafts exist, which still shows correctly).

- [ ] **Step 3: Manual test — navigation**

  1. With comments present, press `↓` button or `]` key.
  2. **Verify:** Page scrolls to the next comment bubble smoothly.
  3. **Verify:** Counter updates to `2 / N`.
  4. **Verify:** A brief blue outline flashes on the anchor element.
  5. Press `↑` or `[` — verify it goes back to `1 / N`.
  6. Wrap-around: press `[` when at index 1 — verify it wraps to last comment.

- [ ] **Step 4: Manual test — Expand All / Close All**

  1. Click "Expand All" — **verify** all thread panels appear and all `openThreadIds` are populated (observable: switching tabs and switching back shows all threads still open).
  2. Click "Close All" — **verify** all thread panels are removed.
  3. Click "Expand All" again, switch to another VS Code tab, switch back — **verify** all threads re-open automatically.

- [ ] **Step 5: Manual test — thread persistence**

  1. Open one or two thread bubbles manually.
  2. Switch to another VS Code tab (editor/terminal).
  3. Switch back to the PR Review panel.
  4. **Verify:** The same threads are open, not closed.
  5. Close a thread (click the bubble).
  6. Switch away and back.
  7. **Verify:** The closed thread stays closed.

- [ ] **Step 6: Commit build artifacts if any are tracked, else final commit**

  ```bash
  git add -p   # stage only intentional changes
  git commit -m "feat: comment nav strip and thread persistence (complete)"
  ```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Left zone: count badge + Expand All + Close All | Task 2 (`_render`) + Task 4 (CSS) |
| Right zone: ↑ counter ↓ | Task 2 (`_render`, `_refreshCounter`) |
| Draft badge continues to append in same header | NavStrip prepends strip; DraftManager appends badge after — order preserved |
| Header hidden when no comments (`:empty` rule) | `update(0)` removes strip element; `:empty` rule in existing CSS handles it |
| `[` = prev, `]` = next keyboard shortcuts | Task 3 Step 5 |
| Navigation scrolls to bubble + CSS flash, no auto-expand | Task 2 (`_navigateTo`) |
| Expand All clicks unopened bubbles | Task 2 (`_expandAll`) |
| Close All removes panels + clears `openThreadIds` | Task 2 (`_closeAll`) + Task 3 (`onCloseAll` callback) |
| `onThreadToggle` in `OverlayCallbacks` | Task 1 |
| `openThreadIds` synced via callback | Task 3 Step 3 |
| Thread re-open after tab switch | Task 3 Step 4 |
| `currentNavIndex` resets on each render | Task 3 Step 4 — `navStrip.update()` calls `this._currentIndex = 0` |
| Highlight: `pr-nav-highlight` 600ms CSS keyframe | Task 4 Step 1 |
| Highlight applied to `[data-line]` parent of bubble | Task 2 `_navigateTo` — `bubble.closest('[data-line]')` |

**Placeholder scan:** None found.

**Type consistency:**
- `NavStrip` constructor: `(header: HTMLElement, bubbleProvider: () => HTMLElement[], onCloseAll: () => void)` — used consistently in Task 3
- `onThreadToggle?: (rootId: number, isOpen: boolean) => void` — defined in Task 1, called in Task 3
- `navStrip?.update(countThreads())` — `countThreads()` returns `number` matching `update(totalComments: number)` ✓
- `navStrip?.next()` / `navStrip?.prev()` in keyboard handler — match NavStrip public API ✓
