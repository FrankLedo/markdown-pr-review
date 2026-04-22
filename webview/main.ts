import { renderMarkdown } from './renderer';
import { placeOverlays, initSelectionHandlers, type OverlayCallbacks } from './overlay';
import { createComposeBox } from './compose';
import { DraftManager } from './draft';
import type { ExtensionMessage, PRComment, RenderMessage, ThreadMeta } from '../src/types';

declare const mermaid: {
  initialize(opts: object): void;
  run(opts: { nodes: NodeList | HTMLElement[] }): Promise<void>;
};

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

let allComments: PRComment[] = [];
let allThreadMeta: ThreadMeta[] = [];
let currentUserLogin = '';
let draft!: DraftManager;
let contentEl: HTMLElement | null = null;
let selectionHandlersReady = false;

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'pr-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function placeOverlaysKeepOpen(): void {
  const openIds = new Set(
    Array.from(document.querySelectorAll<HTMLElement>('[data-thread-for]'))
      .map(el => Number(el.dataset.threadFor))
  );
  placeOverlays(contentEl!, allComments, allThreadMeta, buildCallbacks());
  if (openIds.size > 0) {
    document.querySelectorAll<HTMLElement>('[data-thread-id]').forEach(bubble => {
      if (openIds.has(Number(bubble.dataset.threadId))) bubble.click();
    });
  }
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
      vscode.postMessage({ type: 'postComment', line, body, tempId });
    },
    onAddToDraft: (body) => { draft.add(line, body); },
    onCancel: () => {},
  });
  insertComposeAfter(anchor, box);
}

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  if (msg.type === 'render') {
    handleRender(msg).catch(console.error);
    return;
  }

  if (!contentEl) return;

  if (msg.type === 'commentPosted' || msg.type === 'replyPosted') {
    allComments = allComments.map(c => c.id === msg.tempId ? msg.comment : c);
    placeOverlaysKeepOpen();
    return;
  }

  if (msg.type === 'reviewSubmitted') {
    allComments = [...allComments, ...msg.comments];
    draft?.clear();
    placeOverlaysKeepOpen();
    return;
  }

  if (msg.type === 'commentEdited') {
    allComments = allComments.map(c =>
      c.id === msg.commentId ? { ...c, body: msg.body } : c
    );
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
    return;
  }

  if (msg.type === 'threadUnresolved') {
    allThreadMeta = allThreadMeta.map(m =>
      m.nodeId === msg.threadNodeId ? { ...m, isResolved: false } : m
    );
    placeOverlaysKeepOpen();
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
  allComments = [...msg.comments];
  allThreadMeta = [...msg.threadMeta];

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
  draft?.clear();
  draft = new DraftManager(vscode, header);

  if (!selectionHandlersReady) {
    initSelectionHandlers(contentEl, onAddComment);
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
