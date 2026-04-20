import type { PRComment } from '../src/types';

export function toggleThread(bubble: HTMLElement, comments: PRComment[]): void {
  // If a thread panel is already open next to this bubble's anchor, close it
  const parent = bubble.closest('[data-line]') as HTMLElement | null;
  if (!parent) return;

  const existing = parent.querySelector('.pr-thread');
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'pr-thread';

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
    body.textContent = comment.body;

    item.appendChild(header);
    item.appendChild(body);
    panel.appendChild(item);
  }

  // Insert the thread panel after the anchor element
  parent.insertAdjacentElement('afterend', panel);
}
