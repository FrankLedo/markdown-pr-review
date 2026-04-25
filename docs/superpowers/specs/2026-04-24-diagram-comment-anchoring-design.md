# Diagram Comment Anchoring

**Date:** 2026-04-24
**Status:** Approved — ready for implementation

## Problem

Comment bubbles on Mermaid diagrams currently land at the diagram's fence line (or below the SVG after render). A comment on a specific node or edge should appear near that element in the rendered diagram.

## Goal

Semantic bubble placement: parse the commented source line, find the corresponding SVG element, pin the bubble there. Fallback chain when no element is found. Thread panel opens as a floating popover near the bubble (not inserted into document flow after the diagram, which can be off-screen).

## Architecture

A new **diagram anchor resolution pass** runs between `mermaid.run()` and `placeOverlays()`:

```
render markdown → capture sources → mermaid.run() → resolveDiagramAnchors() → placeOverlays()
```

Mermaid overwrites `.mermaid` div content with the rendered SVG. Sources must be captured from `el.textContent` before `mermaid.run()` is called. They are stored in a `Map<HTMLElement, string>` keyed by the `.mermaid` element.

**Three files change:**
- `webview/diagram-anchors.ts` — new, ~120 lines. Owns resolution logic and fallback chain.
- `webview/overlay.ts` — adds optional `diagramAnchors: Map<number, Point>` param; absolutely positions bubbles on `.mermaid` divs instead of prepending.
- `webview/main.ts` — captures sources, calls resolver, passes results through. Also updates `placeOverlaysKeepOpen`.

**`thread.ts`** gains a `popover` placement mode (see Thread Opening below).

## `diagram-anchors.ts`

```typescript
export type Point = { x: number; y: number };

export function resolveDiagramAnchors(
  container: HTMLElement,
  comments: PRComment[],
  sourceMap: Map<HTMLElement, string>
): Map<number, Point>
```

Returns a `Point` for every thread root ID whose anchor is a `.mermaid` element. All diagram comments get an entry — the fallback chain guarantees a result.

**Per-comment steps:**
1. `findAnchorElement(container, comment.line)` — skip if result doesn't have class `mermaid`.
2. Get `source` from `sourceMap`. `blockStartLine = parseInt(diagramEl.dataset.line)`.
3. `relLine = comment.line - blockStartLine - 2` (0-indexed into source body; accounts for markdown-it's 0-indexed map vs GitHub's 1-indexed line numbers and the fence line itself).
4. `sourceLine = source.split('\n')[relLine]`.
5. Run fallback chain, return first non-null point.

**Fallback chain (first non-null wins):**
1. **Type-aware parser** — detect type, query SVG element by ID or text, return its bounding rect relative to the `.mermaid` div.
2. **Text-search** — strip mermaid syntax chars from `sourceLine`, walk `svg text` nodes for a match.
3. **Proportional Y** — `t = relLine / (totalLines - 1)`, place at `t * svgHeight` down the right edge of the SVG.
4. **Corner** — top-right of SVG, 8px inset.

## Parsers

### Flowchart (`flowchart …` or `graph …`)

Extract first identifier with `/^\s*([A-Za-z0-9_]+)/`. This captures:
- Node definitions: `A[label]`, `A{Decision}`, `A(rounded)`
- Edge source: `A --> B`, `B -->|yes| C`

SVG query: `diagramEl.querySelector('[id^="flowchart-NODEID-"]')`. Mermaid 10 generates `flowchart-A-0`, etc. Prefix match handles the render-counter suffix.

If the line is a subgraph declaration, `style`, or `classDef` — no node match, fall through to text-search.

### Sequence diagram (`sequenceDiagram`)

**Actor lines** (`participant User`, `actor GitHub`): extract name after keyword. Search `diagramEl.querySelectorAll('text')` for exact trimmed match.

**Message lines** (`User->>Extension: text`): extract source actor with `/^(\S+)[-~]+[>)]+/`. Search actor text nodes for the sender — anchors bubble to the sending actor. If actor not found, count message statements preceding this line and select the Nth `text.messageText` element in the SVG.

**Other lines** (`Note over`, `loop`, `alt`, etc.): fall through to text-search on label content, then proportional.

## Bubble Positioning

Bubbles for diagram comments are `position: absolute` inside their `.mermaid` div (which gets `position: relative`). The `Point` from `resolveDiagramAnchors` is in coordinates relative to the `.mermaid` div's top-left corner.

Point coordinates for element-based results: right edge of the matched SVG element (`elementRect.right - containerRect.left`), vertical midpoint (`elementRect.top - containerRect.top + elementRect.height / 2`). This places the bubble to the right of the node/actor.

`placeOverlays` checks `anchor.classList.contains('mermaid')` to take the absolute-position path instead of the current prepend/table/li logic.

## Thread Opening — Floating Popover

Threads on diagram bubbles open as a `position: fixed` popover rather than being inserted into document flow (which can be off-screen for tall diagrams with top-anchored nodes).

**`toggleThread`** gains a `placement?: 'inline' | 'popover'` option in `ThreadOptions`. Default is `'inline'` (existing behaviour unchanged).

When `placement === 'popover'`:
- Panel is appended to `document.body` with `position: fixed`.
- Positioned to the right of the bubble using `bubble.getBoundingClientRect()`. If insufficient right-side space, flip to left. Clamp to viewport top/bottom edges.
- Small CSS arrow indicator pointing toward the bubble.
- Dismissed by clicking outside (one-time `document.addEventListener('click', dismiss)`), or by clicking the bubble again (toggle).
- `openThreadIds` re-open logic in `main.ts`: after re-render, re-click still works — the popover is rebuilt at the bubble's new screen position.

The `placement` value is passed from `overlay.ts` via `OverlayCallbacks` or directly in `createBubble`. Diagram bubbles always use `'popover'`.

## Fallback Behaviour Summary

| Scenario | Result |
|---|---|
| Source line matches flowchart node/edge source | Bubble on that SVG node element |
| Source line is flowchart `style`/`classDef` | Text-search → proportional → corner |
| Source line matches sequence actor | Bubble on actor label |
| Source line is sequence message | Bubble on sender actor |
| Source line is sequence `Note`/`loop` | Text-search label → proportional → corner |
| Unrecognised diagram type | Text-search → proportional → corner |
| No SVG rendered yet (mermaid failed) | Corner of `.mermaid` div |

## Out of Scope

Other Mermaid diagram types (`gantt`, `pie`, `erDiagram`, `classDiagram`, `stateDiagram`) use the text-search → proportional → corner chain without type-aware parsing. Can be added later.

Highlighting the matched SVG element (e.g., glow on the node) is not in scope for this pass.

## Test Fixture

`test/fixtures/pr-review-test.md` has been updated with a flowchart and sequence diagram section. Leave comments on specific nodes/edges/actors/messages to verify placement.
