export interface ComposeCallbacks {
  hasDraft: () => boolean;
  onPostImmediately: (body: string) => void;
  onAddToDraft: (body: string) => void;
  onCancel: () => void;
}

export function createComposeBox(callbacks: ComposeCallbacks): HTMLElement {
  const box = document.createElement('div');
  box.className = 'pr-compose';

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Leave a comment…';

  const actions = document.createElement('div');
  actions.className = 'pr-compose-actions';

  const postBtn = document.createElement('button');
  postBtn.className = 'pr-btn-primary';
  postBtn.textContent = 'Post comment';

  const draftBtn = document.createElement('button');
  draftBtn.className = 'pr-btn-secondary';
  draftBtn.textContent = callbacks.hasDraft() ? 'Add to review' : 'Start review';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pr-btn-secondary';
  cancelBtn.textContent = 'Cancel';

  const errorEl = document.createElement('div');
  errorEl.className = 'pr-compose-error';

  postBtn.addEventListener('click', () => {
    const body = textarea.value.trim();
    if (!body) return;
    textarea.disabled = true;
    postBtn.disabled = true;
    draftBtn.disabled = true;
    postBtn.textContent = 'Posting…';
    errorEl.style.display = 'none';
    callbacks.onPostImmediately(body);
  });

  draftBtn.addEventListener('click', () => {
    const body = textarea.value.trim();
    if (!body) return;
    callbacks.onAddToDraft(body);
    box.remove();
  });

  cancelBtn.addEventListener('click', () => {
    callbacks.onCancel();
    box.remove();
  });

  actions.appendChild(postBtn);
  actions.appendChild(draftBtn);
  actions.appendChild(cancelBtn);
  box.appendChild(textarea);
  box.appendChild(actions);
  box.appendChild(errorEl);

  // Focus textarea on next tick so the element is in the DOM
  setTimeout(() => textarea.focus(), 0);
  return box;
}

export function showComposeError(box: HTMLElement, message: string): void {
  const textarea = box.querySelector('textarea') as HTMLTextAreaElement | null;
  const postBtn = box.querySelector('.pr-btn-primary') as HTMLButtonElement | null;
  const draftBtn = box.querySelector('.pr-btn-secondary') as HTMLButtonElement | null;
  const errorEl = box.querySelector('.pr-compose-error') as HTMLElement | null;
  if (textarea) textarea.disabled = false;
  if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'Post comment'; }
  if (draftBtn) draftBtn.disabled = false;
  if (errorEl) { errorEl.textContent = message; errorEl.style.display = 'block'; }
}
