# Comment Nav Strip & Thread Persistence — Design Spec

Date: 2026-04-22

## Summary

Two related features:
1. **Comment nav strip** — a persistent header bar showing comment count with prev/next navigation and Expand All / Close All controls
2. **Open thread persistence** — open threads survive tab switches (webview context destruction)

These share the same state mechanism and are implemented together.

## UI

The existing `#review-header` sticky bar gains two zones:

```
[ ● 3 comments   Expand All   Close All ]     [ ↑  1 / 3  ↓ ]
```

- **Left zone:** comment count badge + Expand All + Close All buttons
- **Right zone:** ↑ arrow, "current / total" counter, ↓ arrow
- **Draft badge** (from DraftManager) continues to append into the same header, sitting to the right of the nav strip
- Header stays hidden when there are no comments (existing `:empty` rule)
- Keyboard: `[` = prev, `]` = next

### Navigation behavior

Pressing ↑/↓ or `[`/`]`:
1. Advances `currentNavIndex`
2. Scrolls the target bubble into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`)
3. Briefly highlights the anchor element (CSS flash, ~600ms)
4. Does NOT auto-expand the thread — user clicks the bubble to read it

### Expand All / Close All

- **Expand All**: clicks every bubble that isn't already open
- **Close All**: removes all `[data-thread-for]` panels from the DOM, clears `openThreadIds`

## Architecture

### New file: `webview/nav.ts` — `NavStrip` class

Owns the `#review-header` element. Public API:

```typescript
class NavStrip {
  constructor(header: HTMLElement, bubbleProvider: () => HTMLElement[])
  update(totalComments: number): void   // re-renders count + counter
  next(): void
  prev(): void
}
```

`bubbleProvider` is a callback that returns the current ordered list of `.pr-bubble` elements from the DOM. NavStrip doesn't hold a reference to the DOM at construction time — it queries fresh on each navigation so it stays correct after re-renders.

`DraftManager` is initialized after `NavStrip` and appends its badge into the same header element.

### State in `main.ts`

Two new module-level variables:

```typescript
let openThreadIds: Set<number> = new Set();
let currentNavIndex = 0;
let navStrip: NavStrip | undefined;
```

### `OverlayCallbacks` extension

Add one callback to the existing interface in `overlay.ts`:

```typescript
onThreadToggle?: (rootId: number, isOpen: boolean) => void;
```

Called by the bubble click handler in `overlay.ts` after toggling. `main.ts` uses this to keep `openThreadIds` in sync.

### Thread persistence on tab switch

When `'ready'` is received and the last render is re-posted, `handleRender` runs again. After `placeOverlays`, filter `openThreadIds` against bubbles actually present in the DOM (a deleted comment won't have a bubble), then click the survivors to re-expand them. `currentNavIndex` resets to 0 on each render.

### Highlight animation

CSS keyframe added to `ReviewPanel.ts`:

```css
@keyframes pr-nav-highlight {
  0%   { outline: 2px solid var(--vscode-focusBorder, #007acc); }
  100% { outline: 2px solid transparent; }
}
.pr-nav-highlight {
  animation: pr-nav-highlight 600ms ease-out forwards;
}
```

Applied to the anchor element (`[data-line]` parent of the bubble) on navigation, removed after the animation ends.

## Files Changed

| File | Change |
|------|--------|
| `webview/nav.ts` | New — NavStrip class |
| `webview/main.ts` | Add `openThreadIds`, `currentNavIndex`, `navStrip`; wire `onThreadToggle`; re-open threads on re-render; `[`/`]` keyboard handler |
| `webview/overlay.ts` | Add `onThreadToggle` to `OverlayCallbacks`; call it in bubble click handler |
| `src/ReviewPanel.ts` | Add highlight CSS keyframe |

## Out of scope

- Configurable nav strip display style (tracked in issue #9)
- Configurable keyboard shortcuts (to be filed separately)
- Auto-expand on navigation (deliberately excluded — too much collapse/expand state complexity)
