import type { PRComment, ThreadMeta } from '../src/types';
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
  callbacks?: OverlayCallbacks
): HTMLElement {
  const isResolved = meta?.isResolved ?? false;

  const bubble = document.createElement('span');
  bubble.className = isResolved ? 'pr-bubble pr-resolved' : 'pr-bubble';
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
  };

  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleThread(bubble, thread.comments, thread.rootId, options);
  });

  return bubble;
}

export function placeOverlays(
  container: HTMLElement,
  comments: PRComment[],
  threadMeta: ThreadMeta[],
  callbacks?: OverlayCallbacks
): void {
  container.querySelectorAll('.pr-bubble, .pr-thread').forEach(el => el.remove());
  if (comments.length === 0) return;
  const threads = buildThreads(comments);
  for (const thread of threads) {
    const anchor = findAnchorElement(container, thread.line);
    if (!anchor) continue;
    const meta = threadMeta.find(m => m.rootCommentId === thread.rootId);
    const bubble = createBubble(thread, meta, callbacks);
    const floatTarget = anchor.tagName.toLowerCase() === 'li'
      ? ((anchor.querySelector(':scope > p') as HTMLElement) ?? anchor)
      : anchor;
    floatTarget.prepend(bubble);
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

export function initSelectionHandlers(
  container: HTMLElement,
  onAddComment: (anchor: HTMLElement, line: number) => void
): void {
  document.addEventListener('mouseup', () => {
    removeFloatBtn();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const resolved = resolveSelectionAnchor(container);
    if (!resolved) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const btn = document.createElement('button');
    btn.className = 'pr-add-btn';
    btn.textContent = '+ Add comment';
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

    const menu = document.createElement('div');
    menu.className = 'pr-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const item = document.createElement('div');
    item.className = 'pr-context-item';
    item.textContent = '+ Add comment';
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
