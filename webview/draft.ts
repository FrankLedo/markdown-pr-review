export class DraftManager {
  private _count = 0;
  private readonly _vscode: { postMessage(msg: unknown): void };
  private readonly _header: HTMLElement;
  private _badgeEl: HTMLElement | null = null;
  private _errorEl: HTMLSpanElement | null = null;

  constructor(vscode: { postMessage(msg: unknown): void }, header: HTMLElement) {
    this._vscode = vscode;
    this._header = header;
  }

  get count(): number {
    return this._count;
  }

  add(line: number, body: string): void {
    this._count++;
    this._vscode.postMessage({ type: 'addToDraft', line, body });
    this._render();
  }

  clear(): void {
    this._count = 0;
    this._badgeEl?.remove();
    this._badgeEl = null;
    this._errorEl = null;
  }

  showError(message: string): void {
    if (this._errorEl) {
      this._errorEl.textContent = message;
      this._errorEl.style.display = 'inline';
    }
  }

  private _render(): void {
    if (!this._badgeEl) {
      const badge = document.createElement('div');
      badge.className = 'pr-draft-badge';

      const label = document.createElement('span');
      label.className = 'pr-draft-label';

      const submitBtn = document.createElement('button');
      submitBtn.className = 'pr-draft-submit';
      submitBtn.addEventListener('click', () => {
        if (this._errorEl) this._errorEl.style.display = 'none';
        this._vscode.postMessage({ type: 'submitReview' });
      });

      const errorEl = document.createElement('span');
      errorEl.className = 'pr-draft-error';

      badge.appendChild(label);
      badge.appendChild(submitBtn);
      badge.appendChild(errorEl);
      this._header.appendChild(badge);
      this._badgeEl = badge;
      this._errorEl = errorEl;
    }

    const label = this._badgeEl.querySelector('.pr-draft-label') as HTMLElement;
    const submitBtn = this._badgeEl.querySelector('.pr-draft-submit') as HTMLElement;
    label.textContent = `${this._count} pending comment${this._count !== 1 ? 's' : ''}`;
    submitBtn.textContent = `Submit review (${this._count})`;
  }
}
