import type { PRComment } from '../src/types';
import { toggleThread } from './thread';

interface Thread {
  rootId: number;
  line: number;
  comments: PRComment[];
}

// Group flat comment list into threads by following in_reply_to_id chains.
function buildThreads(comments: PRComment[]): Thread[] {
  const roots = new Map<number, Thread>();

  // First pass: collect root comments (no in_reply_to_id)
  for (const c of comments) {
    if (!c.in_reply_to_id) {
      roots.set(c.id, { rootId: c.id, line: c.line, comments: [c] });
    }
  }

  // Second pass: attach replies to their root thread
  for (const c of comments) {
    if (c.in_reply_to_id) {
      const root = roots.get(c.in_reply_to_id);
      if (root) {
        root.comments.push(c);
      }
    }
  }

  return Array.from(roots.values());
}

// Find the element whose data-line value is closest to (but not greater than) the target line.
function findAnchorElement(container: HTMLElement, line: number): HTMLElement | null {
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

function createBubble(thread: Thread): HTMLElement {
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
    toggleThread(bubble, thread.comments, thread.rootId);
  });

  return bubble;
}

export function placeOverlays(container: HTMLElement, comments: PRComment[]): void {
  // Remove any existing bubbles and threads (e.g., on re-render)
  container.querySelectorAll('.pr-bubble, .pr-thread').forEach(el => el.remove());

  if (comments.length === 0) return;

  const threads = buildThreads(comments);

  for (const thread of threads) {
    const anchor = findAnchorElement(container, thread.line);
    if (!anchor) continue;

    const bubble = createBubble(thread);
    // Append bubble inside the anchor element so it floats right within the block
    anchor.appendChild(bubble);
  }
}
