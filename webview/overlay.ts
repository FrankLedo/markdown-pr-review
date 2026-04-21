import type { PRComment } from '../src/types';
import { toggleThread, type OnReply } from './thread';

interface Thread {
  rootId: number;
  line: number;
  comments: PRComment[];
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
    if (elLine <= line && elLine > bestLine) {
      best = el;
      bestLine = elLine;
    }
  }
  return best;
}

function createBubble(thread: Thread, onReply?: OnReply): HTMLElement {
  const bubble = document.createElement('span');
  bubble.className = 'pr-bubble';
  bubble.title = `${thread.comments[0].user.login}: ${thread.comments[0].body.slice(0, 80)}`;

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

  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleThread(bubble, thread.comments, thread.rootId, onReply);
  });

  return bubble;
}

export function placeOverlays(
  container: HTMLElement,
  comments: PRComment[],
  onReply?: OnReply
): void {
  container.querySelectorAll('.pr-bubble, .pr-thread').forEach(el => el.remove());
  if (comments.length === 0) return;
  const threads = buildThreads(comments);
  for (const thread of threads) {
    const anchor = findAnchorElement(container, thread.line);
    if (!anchor) continue;
    const bubble = createBubble(thread, onReply);
    anchor.appendChild(bubble);
  }
}

// Resolves the nearest data-line ancestor of the current selection start.
// Returns null if the selection is empty or no data-line ancestor is found.
function resolveSelectionAnchor(
  container: HTMLElement
): { anchor: HTMLElement; line: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
  if (!el) return null;

  // Walk up to find a data-line ancestor
  let candidate: HTMLElement | null = el;
  while (candidate && candidate !== container) {
    if (candidate.dataset['line']) {
      return { anchor: candidate, line: parseInt(candidate.dataset['line'], 10) };
    }
    candidate = candidate.parentElement;
  }

  // Fallback: last data-line element whose top edge is at or above the selection start
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

    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
    btn.addEventListener('mouseup', (e) => e.stopPropagation()); // prevent doc handler removing btn before click
    btn.addEventListener('click', () => {
      removeFloatBtn();
      onAddComment(resolved.anchor, resolved.line);
      window.getSelection()?.removeAllRanges();
    });

    document.body.appendChild(btn);
    // Adjust left after append so offsetWidth is known; clamp to avoid going off-screen left
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
    // Delay to avoid the current click immediately dismissing the menu
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  });
}
