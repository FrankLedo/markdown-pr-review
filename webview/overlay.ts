import type { PRComment, ThreadMeta } from '../src/types';
import type { Point } from './diagram-anchors';
import { toggleThread, type OnReply, type ThreadOptions } from './thread';

interface Thread {
  rootId: number;
  line: number;
  comments: PRComment[];
}

export interface OverlayCallbacks {
  onReply?: OnReply;
  currentUserLogin?: string;
  onResolve?: (threadNodeId: string) => void;
  onUnresolve?: (threadNodeId: string) => void;
  onEdit?: (commentId: number, newBody: string) => void;
  onDelete?: (commentId: number) => void;
  onThreadToggle?: (rootId: number, isOpen: boolean) => void;
}

function buildThreads(comments: PRComment[]): Thread[] {
  const roots = new Map<number, Thread>();
  for (const c of comments) {
    if (!c.in_reply_to_id) {
      roots.set(c.id, { rootId: c.id, line: c.line, comments: [c] });
    }
  }
  for (const c of comments) {
    if (c.in_reply_to_id) {
      const root = roots.get(c.in_reply_to_id);
      if (root) root.comments.push(c);
    }
  }
  return Array.from(roots.values());
}

export function findAnchorElement(container: HTMLElement, line: number): HTMLElement | null {
  const elements = Array.from(container.querySelectorAll('[data-line]')) as HTMLElement[];
  let best: HTMLElement | null = null;
  let bestLine = -1;
  for (const el of elements) {
    const elLine = parseInt(el.dataset['line']!, 10);
    if (elLine < line && elLine > bestLine) {
      best = el;
      bestLine = elLine;
    }
  }
  return best;
}

function createBubble(
  thread: Thread,
  meta: ThreadMeta | undefined,
  callbacks?: OverlayCallbacks,
  isDiagram = false
): HTMLElement {
  const isResolved = meta?.isResolved ?? false;

  const bubble = document.createElement('span');
  bubble.className = isResolved ? 'pr-bubble pr-resolved' : 'pr-bubble';
  bubble.dataset.threadId = String(thread.rootId);
  bubble.title = isResolved
    ? `✓ Resolved — ${thread.comments[0].user.login}: ${thread.comments[0].body.slice(0, 60)}`
    : `${thread.comments[0].user.login}: ${thread.comments[0].body.slice(0, 80)}`;

  if (isResolved) {
    const check = document.createElement('span');
    check.textContent = '✓';
    check.style.fontSize = '10px';
    bubble.appendChild(check);
  } else {
    const avatar = document.createElement('img');
    avatar.src = thread.comments[0].user.avatar_url;
    avatar.alt = thread.comments[0].user.login;
    avatar.className = 'pr-bubble-avatar';
    bubble.appendChild(avatar);

    if (thread.comments.length > 1) {
      const count = document.createElement('span');
      count.textContent = String(thread.comments.length);
      bubble.appendChild(count);
    }
  }

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

  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !document.querySelector(`[data-thread-for="${thread.rootId}"]`);
    toggleThread(bubble, thread.comments, thread.rootId, options);
    callbacks?.onThreadToggle?.(thread.rootId, isOpen);
  });

  return bubble;
}

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

// Resolves the nearest data-line ancestor of the current selection start.
function resolveSelectionAnchor(
  container: HTMLElement
): { anchor: HTMLElement; line: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
  if (!el) return null;

  let candidate: HTMLElement | null = el;
  while (candidate && candidate !== container) {
    if (candidate.dataset['line']) {
      return { anchor: candidate, line: parseInt(candidate.dataset['line'], 10) };
    }
    candidate = candidate.parentElement;
  }

  const allLines = Array.from(container.querySelectorAll('[data-line]')) as HTMLElement[];
  const selTop = range.getBoundingClientRect().top;
  let best: HTMLElement | null = null;
  for (const lineEl of allLines) {
    if (lineEl.getBoundingClientRect().top <= selTop) best = lineEl;
  }
  if (!best) return null;
  return { anchor: best, line: parseInt(best.dataset['line']!, 10) };
}

let floatBtn: HTMLButtonElement | null = null;
let contextMenu: HTMLElement | null = null;

function removeFloatBtn(): void { floatBtn?.remove(); floatBtn = null; }
function removeContextMenu(): void { contextMenu?.remove(); contextMenu = null; }

function snapLineFor(line: number, validLines: number[]): number | null {
  if (validLines.length === 0 || validLines.includes(line)) return null;
  let best = -1;
  for (const l of validLines) {
    if (l <= line && l > best) best = l;
  }
  if (best !== -1) return best;
  return validLines.reduce((a, b) => Math.abs(b - line) < Math.abs(a - line) ? b : a);
}

export function initSelectionHandlers(
  container: HTMLElement,
  onAddComment: (anchor: HTMLElement, line: number) => void,
  getValidLines: () => number[] = () => []
): void {
  document.addEventListener('mouseup', () => {
    removeFloatBtn();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const resolved = resolveSelectionAnchor(container);
    if (!resolved) return;

    const snapTarget = snapLineFor(resolved.line, getValidLines());
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const btn = document.createElement('button');
    btn.className = snapTarget !== null ? 'pr-add-btn pr-add-btn--snap' : 'pr-add-btn';
    btn.textContent = '+ Add comment';
    btn.title = snapTarget !== null ? 'Line is outside the diff' : '';
    btn.style.left = '0px';
    btn.style.top = `${rect.top - 34}px`;

    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('mouseup', (e) => e.stopPropagation());
    btn.addEventListener('click', () => {
      removeFloatBtn();
      onAddComment(resolved.anchor, resolved.line);
      window.getSelection()?.removeAllRanges();
    });

    document.body.appendChild(btn);
    btn.style.left = `${Math.max(4, rect.right - btn.offsetWidth)}px`;
    floatBtn = btn;
  });

  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) removeFloatBtn();
  });

  container.addEventListener('contextmenu', (e) => {
    removeContextMenu();
    const resolved = resolveSelectionAnchor(container);
    if (!resolved) return;

    e.preventDefault();

    const snapTarget = snapLineFor(resolved.line, getValidLines());
    const menu = document.createElement('div');
    menu.className = 'pr-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const item = document.createElement('div');
    item.className = 'pr-context-item';
    item.textContent = snapTarget !== null
      ? '+ Add comment (outside diff)'
      : '+ Add comment';
    item.addEventListener('click', () => {
      removeContextMenu();
      onAddComment(resolved.anchor, resolved.line);
      window.getSelection()?.removeAllRanges();
    });

    menu.appendChild(item);
    document.body.appendChild(menu);
    contextMenu = menu;

    const dismiss = (): void => {
      removeContextMenu();
      document.removeEventListener('click', dismiss);
    };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  });
}
