import type { PRComment } from '../src/types';
import { renderMarkdown } from './renderer';

export type OnReply = (panel: HTMLElement, rootId: number, line: number) => void;

export interface ThreadOptions {
  onReply?: OnReply;
  threadNodeId?: string;
  isResolved?: boolean;
  currentUserLogin?: string;
  onResolve?: (nodeId: string) => void;
  onUnresolve?: (nodeId: string) => void;
  onEdit?: (commentId: number, newBody: string) => void;
  onDelete?: (commentId: number) => void;
  placement?: 'inline' | 'popover';
}

function closeDotMenus(container: HTMLElement): void {
  container.querySelectorAll('.pr-dot-menu').forEach(m => m.remove());
}

function startEdit(
  item: HTMLElement,
  comment: PRComment,
  bodyEl: HTMLElement,
  options: ThreadOptions
): void {
  const originalHTML = bodyEl.innerHTML;

  const textarea = document.createElement('textarea');
  textarea.className = 'pr-compose textarea';
  // Inline the textarea style so it works without a wrapper
  textarea.style.cssText = 'width:100%;min-height:60px;background:var(--vscode-input-background,transparent);color:var(--vscode-input-foreground,inherit);border:1px solid var(--vscode-input-border,rgba(255,255,255,0.2));border-radius:3px;padding:6px;font-family:var(--vscode-font-family);font-size:13px;resize:vertical;box-sizing:border-box;display:block;margin-bottom:6px;';
  textarea.value = comment.body;

  const actions = document.createElement('div');
  actions.className = 'pr-compose-actions';

  const updateBtn = document.createElement('button');
  updateBtn.className = 'pr-btn-primary';
  updateBtn.textContent = 'Update comment';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pr-btn-secondary';
  cancelBtn.textContent = 'Cancel';

  actions.appendChild(updateBtn);
  actions.appendChild(cancelBtn);

  bodyEl.innerHTML = '';
  bodyEl.appendChild(textarea);
  bodyEl.appendChild(actions);
  textarea.focus();

  cancelBtn.addEventListener('click', () => {
    bodyEl.innerHTML = originalHTML;
  });

  updateBtn.addEventListener('click', () => {
    const newBody = textarea.value.trim();
    if (!newBody) return;
    if (newBody === comment.body) { bodyEl.innerHTML = originalHTML; return; }
    updateBtn.disabled = true;
    cancelBtn.disabled = true;
    options.onEdit?.(comment.id, newBody);
  });
}

function startDelete(
  item: HTMLElement,
  comment: PRComment,
  bodyEl: HTMLElement,
  options: ThreadOptions
): void {
  const originalHTML = bodyEl.innerHTML;

  const confirm = document.createElement('div');
  confirm.className = 'pr-delete-confirm';
  confirm.textContent = 'Delete this comment?\u00a0';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'pr-btn-danger';
  deleteBtn.textContent = 'Delete';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pr-btn-secondary';
  cancelBtn.textContent = 'Cancel';

  confirm.appendChild(deleteBtn);
  confirm.appendChild(cancelBtn);

  bodyEl.innerHTML = '';
  bodyEl.appendChild(confirm);

  cancelBtn.addEventListener('click', () => { bodyEl.innerHTML = originalHTML; });
  deleteBtn.addEventListener('click', () => {
    deleteBtn.disabled = true;
    cancelBtn.disabled = true;
    options.onDelete?.(comment.id);
  });
}

function addDotMenu(
  item: HTMLElement,
  comment: PRComment,
  bodyEl: HTMLElement,
  options: ThreadOptions
): void {
  const btn = document.createElement('button');
  btn.className = 'pr-dot-menu-btn';
  btn.textContent = '⋯';
  btn.title = 'More actions';
  item.appendChild(btn);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = item.querySelector('.pr-dot-menu');
    if (existing) { existing.remove(); return; }
    closeDotMenus(item.closest('.pr-thread') as HTMLElement ?? document.body);

    const menu = document.createElement('div');
    menu.className = 'pr-dot-menu';

    const editItem = document.createElement('div');
    editItem.className = 'pr-dot-menu-item';
    editItem.textContent = 'Edit';
    editItem.addEventListener('click', () => {
      menu.remove();
      startEdit(item, comment, bodyEl, options);
    });

    const deleteItem = document.createElement('div');
    deleteItem.className = 'pr-dot-menu-item pr-delete-item';
    deleteItem.textContent = 'Delete';
    deleteItem.addEventListener('click', () => {
      menu.remove();
      startDelete(item, comment, bodyEl, options);
    });

    menu.appendChild(editItem);
    menu.appendChild(deleteItem);
    item.appendChild(menu);

    const dismiss = (): void => { menu.remove(); };
    setTimeout(() => document.addEventListener('click', dismiss, { once: true }), 0);
  });
}

function tableColCount(table: Element): number {
  let max = 1;
  table.querySelectorAll('tr').forEach(row => {
    let cols = 0;
    row.querySelectorAll('td, th').forEach(cell => { cols += (cell as HTMLTableCellElement).colSpan || 1; });
    if (cols > max) max = cols;
  });
  return max;
}

export function insertAfterInTable(anchor: HTMLElement, content: HTMLElement): (() => void) | null {
  const tr = anchor.closest('tr') as HTMLElement | null;
  if (!tr) return null;
  const table = tr.closest('table')!;
  const wrapRow = document.createElement('tr');
  wrapRow.className = 'pr-table-thread-row';
  const wrapCell = document.createElement('td');
  wrapCell.colSpan = tableColCount(table);
  wrapCell.style.padding = '0';
  wrapCell.appendChild(content);
  wrapRow.appendChild(wrapCell);
  tr.insertAdjacentElement('afterend', wrapRow);
  return () => wrapRow.remove();
}

function buildPanel(comments: PRComment[], threadId: number, options?: ThreadOptions): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'pr-thread';
  panel.dataset.threadFor = String(threadId);

  if (options?.isResolved) {
    const banner = document.createElement('div');
    banner.className = 'pr-thread-resolved-banner';
    banner.textContent = '✓ Resolved conversation';
    panel.appendChild(banner);
  }

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

    if (options?.currentUserLogin && comment.user.login === options.currentUserLogin) {
      addDotMenu(item, comment, body, options);
    }

    panel.appendChild(item);
  }

  const footer = document.createElement('div');
  footer.className = 'pr-thread-footer';
  footer.style.display = 'flex';
  footer.style.gap = '6px';
  footer.style.marginTop = '8px';

  if (options?.onReply) {
    const replyBtn = document.createElement('button');
    replyBtn.className = 'pr-reply-btn';
    replyBtn.textContent = 'Reply';
    replyBtn.addEventListener('click', () => {
      const rootComment = comments.find(c => !c.in_reply_to_id) ?? comments[0];
      options.onReply!(panel, rootComment.id, rootComment.line);
    });
    footer.appendChild(replyBtn);
  }

  if (options?.threadNodeId) {
    if (options.isResolved) {
      const unresolveBtn = document.createElement('button');
      unresolveBtn.className = 'pr-resolve-btn';
      unresolveBtn.textContent = 'Unresolve';
      unresolveBtn.addEventListener('click', () => {
        unresolveBtn.disabled = true;
        unresolveBtn.textContent = 'Unresolving…';
        options.onUnresolve?.(options.threadNodeId!);
      });
      footer.appendChild(unresolveBtn);
    } else {
      const resolveBtn = document.createElement('button');
      resolveBtn.className = 'pr-resolve-btn';
      resolveBtn.textContent = 'Resolve conversation';
      resolveBtn.addEventListener('click', () => {
        resolveBtn.disabled = true;
        resolveBtn.textContent = 'Resolving…';
        options.onResolve?.(options.threadNodeId!);
      });
      footer.appendChild(resolveBtn);
    }
  }

  panel.appendChild(footer);
  return panel;
}

function showAsPopover(bubble: HTMLElement, panel: HTMLElement): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'pr-popover';

  const arrow = document.createElement('div');
  wrapper.appendChild(arrow);
  wrapper.appendChild(panel);
  document.body.appendChild(wrapper);

  // Position after appending so getBoundingClientRect is accurate
  const bubbleRect = bubble.getBoundingClientRect();
  const wRect = wrapper.getBoundingClientRect();
  const GAP = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = bubbleRect.right + GAP;
  let arrowClass = 'pr-popover-arrow pr-popover-arrow--left';

  if (left + wRect.width > vw - GAP) {
    left = bubbleRect.left - wRect.width - GAP;
    arrowClass = 'pr-popover-arrow pr-popover-arrow--right';
  }

  // Clamp left to prevent off-screen when flipping to left
  left = Math.max(GAP, left);

  const top = Math.max(GAP, Math.min(
    bubbleRect.top + bubbleRect.height / 2 - wRect.height / 2,
    vh - wRect.height - GAP
  ));

  wrapper.style.cssText = `position:fixed;z-index:9999;left:${left}px;top:${top}px;`;
  arrow.className = arrowClass;

  // Clamp arrow top to stay within bounds
  const arrowTop = Math.max(0, Math.min(
    bubbleRect.top + bubbleRect.height / 2 - top - 5,
    wRect.height - 10
  ));
  arrow.style.cssText = `top:${arrowTop}px;`;

  const dismiss = (e: MouseEvent): void => {
    // Check if wrapper is still connected to DOM; if not, cleanup listener
    if (!wrapper.isConnected) {
      document.removeEventListener('click', dismiss);
      return;
    }
    if (!wrapper.contains(e.target as Node) && e.target !== bubble) {
      wrapper.remove();
      document.removeEventListener('click', dismiss);
    }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

export function toggleThread(
  bubble: HTMLElement,
  comments: PRComment[],
  threadId: number,
  options?: ThreadOptions
): void {
  const existing = document.querySelector(`[data-thread-for="${threadId}"]`);
  if (existing) {
    (existing.closest('.pr-popover') ?? existing.closest('.pr-table-thread-row') ?? existing).remove();
    return;
  }

  const panel = buildPanel(comments, threadId, options);

  if (options?.placement === 'popover') {
    showAsPopover(bubble, panel);
    return;
  }

  const parent = bubble.closest('[data-line]') as HTMLElement | null;
  if (!parent) return;
  if (!insertAfterInTable(parent, panel)) {
    parent.insertAdjacentElement('afterend', panel);
  }
}
