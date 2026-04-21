import type { PRComment } from '../src/types';
import { renderMarkdown } from './renderer';

export function toggleThread(bubble: HTMLElement, comments: PRComment[], threadId: number): void {
  // Use data-thread-for so each thread panel can be toggled independently,
  // even when two threads share the same data-line anchor element.
  const existing = document.querySelector(`[data-thread-for="${threadId}"]`);
  if (existing) {
    existing.remove();
    return;
  }

  const parent = bubble.closest('[data-line]') as HTMLElement | null;
  if (!parent) return;

  const panel = document.createElement('div');
  panel.className = 'pr-thread';
  panel.dataset.threadFor = String(threadId);

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
    panel.appendChild(item);
  }

  // Insert the thread panel after the anchor element
  parent.insertAdjacentElement('afterend', panel);
}
