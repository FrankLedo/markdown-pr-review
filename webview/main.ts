import { renderMarkdown } from './renderer';
import { placeOverlays, initSelectionHandlers, type OverlayCallbacks } from './overlay';
import { createComposeBox } from './compose';
import { DraftManager } from './draft';
import { NavStrip } from './nav';
import { insertAfterInTable } from './thread';
import type { ExtensionMessage, PRComment, RenderMessage, ThreadMeta } from '../src/types';

declare const mermaid: {
  initialize(opts: object): void;
  run(opts: { nodes: NodeList | HTMLElement[] }): Promise<void>;
};

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

let allComments: PRComment[] = [];
let allThreadMeta: ThreadMeta[] = [];
let validLines: number[] = [];
let currentUserLogin = '';
let draft!: DraftManager;
let contentEl: HTMLElement | null = null;
let selectionHandlersReady = false;
let openThreadIds: Set<number> = new Set();
let navStrip: NavStrip | undefined;

function countThreads(): number {
  return document.querySelectorAll<HTMLElement>('[data-thread-id]').length;
}

const LINE_META_RE = /\n\n---\n\*Comment on line (\d+)\*$/;

function processComment(c: PRComment): PRComment {
  const m = c.body.match(LINE_META_RE);
  if (!m) return c;
  return { ...c, body: c.body.slice(0, m.index as number), line: parseInt(m[1], 10) };
}

function fileShortName(filePath: string, allPaths: string[]): string {
  const base = filePath.split('/').pop()!;
  const hasDupe = allPaths.filter(p => p.split('/').pop() === base).length > 1;
  return hasDupe ? filePath.split('/').slice(-2).join('/') : base;
}

function fileOptionLabel(filePath: string, openCount: number, resolvedCount: number, allPaths: string[]): string {
  const name = fileShortName(filePath, allPaths);
  const total = openCount + resolvedCount;
  if (total === 0) return name;
  if (openCount > 0 && resolvedCount > 0) return `${name} (${openCount} open, ${resolvedCount} resolved)`;
  if (openCount > 0) return `${name} (${openCount} open)`;
  return `${name} (${resolvedCount} resolved)`;
}

function updateCurrentFileOption(): void {
  const selectEl = document.querySelector<HTMLSelectElement>('.pr-file-select');
  if (!selectEl) return;
  const opt = selectEl.options[selectEl.selectedIndex];
  if (!opt) return;
  const allPaths = Array.from(selectEl.options).map(o => o.value);
  const openCount = allThreadMeta.filter(t => !t.isResolved).length;
  const resolvedCount = allThreadMeta.filter(t => t.isResolved).length;
  opt.textContent = fileOptionLabel(opt.value, openCount, resolvedCount, allPaths);
}

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'pr-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function placeOverlaysKeepOpen(): void {
  placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
  navStrip?.refresh(countThreads());
  document.querySelectorAll<HTMLElement>('[data-thread-id]').forEach(bubble => {
    if (openThreadIds.has(Number(bubble.dataset.threadId))) bubble.click();
  });
}

function buildCallbacks(): OverlayCallbacks {
  return {
    onReply: (panel, rootId, line) => {
      panel.querySelector('.pr-compose')?.remove();
      const box = createComposeBox({
        hasDraft: () => draft.count > 0,
        onPostImmediately: (body) => {
          const tempId = -Date.now();
          allComments.push({
            id: tempId,
            node_id: '',
            in_reply_to_id: rootId,
            line,
            body,
            user: { login: currentUserLogin, avatar_url: '' },
            created_at: new Date().toISOString(),
          });
          box.remove();
          placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
          navStrip?.refresh(countThreads());
          vscode.postMessage({ type: 'postReply', inReplyToId: rootId, line, body, tempId });
        },
        onAddToDraft: (body) => { draft.add(line, body); },
        onCancel: () => {},
      });
      panel.appendChild(box);
    },
    currentUserLogin,
    onEdit: (commentId, newBody) => {
      vscode.postMessage({ type: 'editComment', commentId, body: newBody });
    },
    onDelete: (commentId) => {
      vscode.postMessage({ type: 'deleteComment', commentId });
    },
    onResolve: (threadNodeId) => {
      vscode.postMessage({ type: 'resolveThread', threadNodeId });
    },
    onUnresolve: (threadNodeId) => {
      vscode.postMessage({ type: 'unresolveThread', threadNodeId });
    },
    onThreadToggle: (rootId, isOpen) => {
      if (isOpen) {
        openThreadIds.add(rootId);
      } else {
        openThreadIds.delete(rootId);
      }
    },
  };
}

function insertComposeAfter(anchor: HTMLElement, box: HTMLElement): void {
  const tag = anchor.tagName.toLowerCase();
  if (tag === 'li') {
    anchor.querySelector('.pr-compose')?.remove();
    anchor.appendChild(box);
    return;
  }
  if (anchor.parentElement?.tagName.toLowerCase() === 'li') {
    anchor.parentElement.querySelector('.pr-compose')?.remove();
    anchor.parentElement.appendChild(box);
    return;
  }
  // Table cell: inject a full-width row so the compose box doesn't break the table layout.
  // Override box.remove so the wrapper row is torn down when the compose is dismissed.
  const removeWrapper = insertAfterInTable(anchor, box);
  if (removeWrapper) {
    const orig = box.remove.bind(box);
    box.remove = () => { orig(); removeWrapper(); };
    return;
  }
  anchor.nextElementSibling?.classList.contains('pr-compose') && anchor.nextElementSibling.remove();
  anchor.insertAdjacentElement('afterend', box);
}

function onAddComment(anchor: HTMLElement, line: number): void {
  const box = createComposeBox({
    hasDraft: () => draft.count > 0,
    onPostImmediately: (body) => {
      const tempId = -Date.now();
      allComments.push({
        id: tempId,
        node_id: '',
        line: line + 1,
        body,
        user: { login: currentUserLogin, avatar_url: '' },
        created_at: new Date().toISOString(),
      });
      box.remove();
      placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
      navStrip?.refresh(countThreads());
      vscode.postMessage({ type: 'postComment', line, body, tempId });
    },
    onAddToDraft: (body) => { draft.add(line, body); },
    onCancel: () => {},
  });
  insertComposeAfter(anchor, box);
}

vscode.postMessage({ type: 'ready' });

document.addEventListener('keydown', (e) => {
  if ((e.target as Element).closest('textarea, input')) return;
  if (e.key === '[') { e.preventDefault(); navStrip?.prev(); }
  if (e.key === ']') { e.preventDefault(); navStrip?.next(); }
});

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  if (msg.type === 'render') {
    handleRender(msg).catch(console.error);
    return;
  }

  if (!contentEl) return;

  if (msg.type === 'commentPosted' || msg.type === 'replyPosted') {
    allComments = allComments.map(c => c.id === msg.tempId ? processComment(msg.comment) : c);
    placeOverlaysKeepOpen();
    if (msg.snapped) showToast('Not on a changed line — anchored nearby. Original line noted in comment.');
    return;
  }

  if (msg.type === 'reviewSubmitted') {
    allComments = [...allComments, ...msg.comments.map(processComment)];
    draft?.clear();
    placeOverlaysKeepOpen();
    return;
  }

  if (msg.type === 'commentEdited') {
    allComments = allComments.map(c => {
      if (c.id !== msg.commentId) return c;
      const m = msg.body.match(LINE_META_RE);
      return m
        ? { ...c, body: msg.body.slice(0, m.index as number), line: parseInt(m[1], 10) }
        : { ...c, body: msg.body };
    });
    placeOverlaysKeepOpen();
    return;
  }

  if (msg.type === 'commentDeleted') {
    allComments = allComments.filter(c => c.id !== msg.commentId && c.in_reply_to_id !== msg.commentId);
    placeOverlaysKeepOpen();
    return;
  }

  if (msg.type === 'threadResolved') {
    allThreadMeta = allThreadMeta.map(m =>
      m.nodeId === msg.threadNodeId ? { ...m, isResolved: true } : m
    );
    placeOverlaysKeepOpen();
    updateCurrentFileOption();
    return;
  }

  if (msg.type === 'threadUnresolved') {
    allThreadMeta = allThreadMeta.map(m =>
      m.nodeId === msg.threadNodeId ? { ...m, isResolved: false } : m
    );
    placeOverlaysKeepOpen();
    updateCurrentFileOption();
    return;
  }

  if (msg.type === 'postError') {
    if (msg.tempId != null) {
      allComments = allComments.filter(c => c.id !== msg.tempId);
      placeOverlaysKeepOpen();
      showToast(`Failed to post — ${msg.message}`);
    } else if (msg.source === 'draft') {
      draft.showError(`Submit failed — ${msg.message}`);
    } else {
      placeOverlaysKeepOpen();
      showToast(`Action failed — ${msg.message}`);
    }
  }
});

async function handleRender(msg: RenderMessage): Promise<void> {
  contentEl = document.getElementById('content');
  if (!contentEl) return;

  currentUserLogin = msg.currentUserLogin;
  allComments = msg.comments.map(processComment);
  allThreadMeta = [...msg.threadMeta];
  validLines = msg.validLines ?? [];

  // Build/update file-switcher dropdown in-place to avoid destroying NavStrip DOM
  const headerEl = document.getElementById('review-header')!;
  let selectEl = headerEl.querySelector<HTMLSelectElement>('.pr-file-select');
  if (!selectEl) {
    selectEl = document.createElement('select');
    selectEl.className = 'pr-file-select';
    selectEl.addEventListener('change', () => {
      vscode.postMessage({ type: 'switchFile', path: selectEl!.value });
    });
    headerEl.appendChild(selectEl);
  }
  selectEl.innerHTML = '';
  const allPaths = msg.prFiles.map(x => x.path);
  for (const f of msg.prFiles) {
    const opt = document.createElement('option');
    opt.value = f.path;
    opt.textContent = fileOptionLabel(f.path, f.openCount, f.resolvedCount, allPaths);
    opt.selected = f.path === msg.filePath;
    selectEl.appendChild(opt);
  }

  contentEl.innerHTML = renderMarkdown(msg.markdown);

  const isDark =
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast');

  mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });

  const mermaidNodes = contentEl.querySelectorAll<HTMLElement>('.mermaid');
  if (mermaidNodes.length > 0) {
    await mermaid.run({ nodes: mermaidNodes });
  }

  placeOverlays(contentEl, allComments, allThreadMeta, buildCallbacks());

  const header = document.getElementById('review-header')!;
  if (!navStrip) {
    navStrip = new NavStrip(
      header,
      () => Array.from(document.querySelectorAll<HTMLElement>('[data-thread-id]')),
      () => { openThreadIds.clear(); }
    );
  }
  navStrip.update(countThreads());

  // Re-open threads that were open before the tab switch, filtered to bubbles present in DOM
  document.querySelectorAll<HTMLElement>('[data-thread-id]').forEach(bubble => {
    if (openThreadIds.has(Number(bubble.dataset.threadId))) bubble.click();
  });

  draft?.clear();
  draft = new DraftManager(vscode, header);

  if (!selectionHandlersReady) {
    initSelectionHandlers(contentEl, onAddComment, () => validLines);
    // VS Code webviews intercept all link navigation including #anchor same-page
    // links. Handle them manually so TOC links scroll to the correct heading.
    document.addEventListener('click', (e) => {
      const a = (e.target as Element).closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href?.startsWith('#')) return;
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    });
    selectionHandlersReady = true;
  }
}
