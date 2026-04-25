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
  // participant/actor declarations — prefer alias over quoted/plain name
  const declMatch = sourceLine.trim().match(
    /^(?:participant|actor)\s+(?:"[^"]*"|\S+)(?:\s+as\s+(\S+))?/i
  );
  if (declMatch) {
    if (declMatch[1]) return declMatch[1]; // has alias: return it
    // plain unquoted name: extract it (but not quoted names without alias)
    const plain = sourceLine.trim().match(/^(?:participant|actor)\s+([^"\s]\S*)/i);
    return plain ? plain[1] : null;
  }
  // message line: extract sender actor (includes -x arrow for cross)
  const msg = sourceLine.trim().match(/^(\S+?)(?:[-~][-~>)x]+)/);
  if (msg) return msg[1];
  return null;
}

// ─── DOM helpers (not unit-testable; verified manually in Task 8) ─────────────

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
  const MSG_RE = /^\s*\S+[-~]+[>)x]+/;
  const lines = source.split('\n');

  // For message lines: anchor to the specific message label (at the right height),
  // not the actor box (which is always at the top of the diagram).
  if (MSG_RE.test(lines[relLine] ?? '')) {
    let msgIdx = 0;
    for (let i = 0; i < relLine; i++) {
      if (MSG_RE.test(lines[i] ?? '')) msgIdx++;
    }
    const msgs = Array.from(diagramEl.querySelectorAll('text.messageText, .messageText'));
    const el = msgs[msgIdx];
    if (el) return el;
  }

  // For participant/actor declarations (or message fallback): find actor text node.
  for (const textEl of Array.from(diagramEl.querySelectorAll('text'))) {
    if (textEl.textContent?.trim() === actorName) return textEl;
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
  for (const textEl of Array.from(diagramEl.querySelectorAll('text, tspan'))) {
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
    const relLine = Math.max(0, comment.line - blockStartLine - 2);
    const sourceLines = source.split('\n');
    const sourceLine = sourceLines[relLine] ?? '';
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
