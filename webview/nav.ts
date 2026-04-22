export class NavStrip {
  private readonly _header: HTMLElement;
  private readonly _bubbleProvider: () => HTMLElement[];
  private readonly _onCloseAll: () => void;
  private _currentIndex = 0;
  private _stripEl: HTMLElement | null = null;
  private _counterEl: HTMLElement | null = null;
  private _countBadgeEl: HTMLElement | null = null;

  constructor(
    header: HTMLElement,
    bubbleProvider: () => HTMLElement[],
    onCloseAll: () => void
  ) {
    this._header = header;
    this._bubbleProvider = bubbleProvider;
    this._onCloseAll = onCloseAll;
  }

  // Full re-render: resets navigation index to 0 (use after placeOverlays on handleRender).
  update(totalComments: number): void {
    this._currentIndex = 0;
    if (totalComments === 0) {
      this._stripEl?.remove();
      this._stripEl = null;
      this._counterEl = null;
      this._countBadgeEl = null;
      return;
    }
    if (!this._stripEl) {
      this._render();
    }
    this._refreshBadge(totalComments);
    this._refreshCounter();
  }

  next(): void {
    const bubbles = this._bubbleProvider();
    if (bubbles.length === 0) return;
    this._currentIndex = (this._currentIndex + 1) % bubbles.length;
    this._navigateTo(bubbles[this._currentIndex]);
    this._refreshCounter();
  }

  prev(): void {
    const bubbles = this._bubbleProvider();
    if (bubbles.length === 0) return;
    this._currentIndex = (this._currentIndex - 1 + bubbles.length) % bubbles.length;
    this._navigateTo(bubbles[this._currentIndex]);
    this._refreshCounter();
  }

  // Incremental update: refreshes count and counter WITHOUT resetting nav index (use for partial re-renders).
  refresh(totalComments: number): void {
    if (totalComments === 0) {
      this._stripEl?.remove();
      this._stripEl = null;
      this._counterEl = null;
      this._countBadgeEl = null;
      return;
    }
    if (!this._stripEl) {
      this._render();
    }
    this._refreshBadge(totalComments);
    this._refreshCounter();
  }

  private _render(): void {
    const strip = document.createElement('div');
    strip.className = 'pr-nav-strip';

    const left = document.createElement('span');
    left.className = 'pr-nav-left';

    const countBadge = document.createElement('span');
    countBadge.className = 'pr-nav-count';

    const expandAllBtn = document.createElement('button');
    expandAllBtn.className = 'pr-nav-btn';
    expandAllBtn.textContent = 'Expand All';
    expandAllBtn.addEventListener('click', () => this._expandAll());

    const closeAllBtn = document.createElement('button');
    closeAllBtn.className = 'pr-nav-btn';
    closeAllBtn.textContent = 'Close All';
    closeAllBtn.addEventListener('click', () => this._closeAll());

    left.appendChild(countBadge);
    left.appendChild(expandAllBtn);
    left.appendChild(closeAllBtn);

    const right = document.createElement('span');
    right.className = 'pr-nav-right';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'pr-nav-btn';
    prevBtn.textContent = '↑';
    prevBtn.title = 'Previous comment ([)';
    prevBtn.addEventListener('click', () => this.prev());

    const counterEl = document.createElement('span');
    counterEl.className = 'pr-nav-counter';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'pr-nav-btn';
    nextBtn.textContent = '↓';
    nextBtn.title = 'Next comment (])';
    nextBtn.addEventListener('click', () => this.next());

    right.appendChild(prevBtn);
    right.appendChild(counterEl);
    right.appendChild(nextBtn);

    strip.appendChild(left);
    strip.appendChild(right);

    this._header.prepend(strip);
    this._stripEl = strip;
    this._counterEl = counterEl;
    this._countBadgeEl = countBadge;
  }

  private _refreshBadge(totalComments: number): void {
    if (!this._countBadgeEl) return;
    this._countBadgeEl.textContent = `● ${totalComments} comment${totalComments !== 1 ? 's' : ''}`;
  }

  private _refreshCounter(): void {
    if (!this._counterEl) return;
    const total = this._bubbleProvider().length;
    if (total === 0) {
      this._counterEl.textContent = '';
      return;
    }
    this._counterEl.textContent = `${this._currentIndex + 1} / ${total}`;
  }

  private _navigateTo(bubble: HTMLElement): void {
    const anchor = bubble.closest('[data-line]') as HTMLElement | null;
    if (!anchor) return;
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    anchor.classList.remove('pr-nav-highlight');
    void anchor.offsetWidth; // force reflow so animation restarts on rapid calls
    anchor.classList.add('pr-nav-highlight');
    anchor.addEventListener('animationend', () => anchor.classList.remove('pr-nav-highlight'), { once: true });
  }

  private _expandAll(): void {
    this._bubbleProvider().forEach(bubble => {
      const threadId = bubble.dataset.threadId;
      if (threadId && !document.querySelector(`[data-thread-for="${threadId}"]`)) {
        bubble.click();
      }
    });
  }

  private _closeAll(): void {
    document.querySelectorAll<HTMLElement>('[data-thread-for]').forEach(el => el.remove());
    this._onCloseAll();
    this._refreshCounter();
  }
}
