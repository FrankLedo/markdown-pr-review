import { renderMarkdown } from './renderer';
import { placeOverlays, initSelectionHandlers } from './overlay';
import type { OnReply } from './thread';
import { createComposeBox } from './compose';
import { DraftManager } from './draft';
import type { ExtensionMessage, PRComment, RenderMessage } from '../src/types';

declare const mermaid: {
  initialize(opts: object): void;
  run(opts: { nodes: NodeList | HTMLElement[] }): Promise<void>;
};

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

let allComments: PRComment[] = [];
let currentUserLogin = '';
let draft!: DraftManager; // assigned in handleRender before any user interaction
let contentEl: HTMLElement | null = null;
let selectionHandlersReady = false;

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'pr-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

const onReply: OnReply = (panel, rootId, line) => {
  panel.querySelector('.pr-compose')?.remove();
  const box = createComposeBox({
    hasDraft: () => draft.count > 0,
    onPostImmediately: (body) => {
      const tempId = -Date.now();
      allComments.push({
        id: tempId,
        in_reply_to_id: rootId,
        line,
        body,
        user: { login: currentUserLogin, avatar_url: '' },
        created_at: new Date().toISOString(),
      });
      box.remove();
      placeOverlays(contentEl!, allComments, onReply);
      vscode.postMessage({ type: 'postReply', inReplyToId: rootId, line, body, tempId });
    },
    onAddToDraft: (body) => { draft.add(line, body); },
    onCancel: () => {},
  });
  panel.appendChild(box);
};

function insertComposeAfter(anchor: HTMLElement, box: HTMLElement): void {
  // A <div> inserted after a <li> inside an <ol>/<ul> is invalid HTML and Chrome
  // renders it at an unpredictable position. Walk up through list structure until
  // we reach a safe insertion point, then append inside that container element.
  let el: HTMLElement = anchor;
  while (el.parentElement) {
    const parentTag = el.parentElement.tagName.toLowerCase();
    if (parentTag === 'ol' || parentTag === 'ul') {
      el = el.parentElement; // skip past the list — insert after the whole list
      break;
    }
    if (parentTag === 'li') {
      // append inside the <li> so the compose box is visually indented with the item
      el.parentElement.querySelector('.pr-compose')?.remove();
      el.parentElement.appendChild(box);
      return;
    }
    break;
  }
  el.querySelector('.pr-compose')?.remove();
  el.nextElementSibling?.classList.contains('pr-compose') && el.nextElementSibling.remove();
  el.insertAdjacentElement('afterend', box);
}

function onAddComment(anchor: HTMLElement, line: number): void {
  const box = createComposeBox({
    hasDraft: () => draft.count > 0,
    onPostImmediately: (body) => {
      const tempId = -Date.now();
      allComments.push({
        id: tempId,
        line,
        body,
        user: { login: currentUserLogin, avatar_url: '' },
        created_at: new Date().toISOString(),
      });
      box.remove();
      placeOverlays(contentEl!, allComments, onReply);
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

  if (msg.type === 'commentPosted' || msg.type === 'replyPosted') {
    allComments = allComments.map(c => c.id === msg.tempId ? msg.comment : c);
    placeOverlays(contentEl!, allComments, onReply);
    return;
  }

  if (msg.type === 'reviewSubmitted') {
    allComments = [...allComments, ...msg.comments];
    draft.clear();
    placeOverlays(contentEl!, allComments, onReply);
    return;
  }

  if (msg.type === 'postError') {
    if (msg.tempId != null) {
      allComments = allComments.filter(c => c.id !== msg.tempId);
      placeOverlays(contentEl!, allComments, onReply);
      showToast(`Failed to post — ${msg.message}`);
    } else {
      draft.showError(`Submit failed — ${msg.message}`);
    }
  }
});

async function handleRender(msg: RenderMessage): Promise<void> {
  contentEl = document.getElementById('content');
  if (!contentEl) return;

  currentUserLogin = msg.currentUserLogin;
  allComments = [...msg.comments];

  contentEl.innerHTML = renderMarkdown(msg.markdown);

  const isDark =
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast');

  mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });

  const mermaidNodes = contentEl.querySelectorAll<HTMLElement>('.mermaid');
  if (mermaidNodes.length > 0) {
    await mermaid.run({ nodes: mermaidNodes });
  }

  placeOverlays(contentEl, allComments, onReply);

  const header = document.getElementById('review-header')!;
  draft?.clear();
  draft = new DraftManager(vscode, header);

  if (!selectionHandlersReady) {
    initSelectionHandlers(contentEl, onAddComment);
    selectionHandlersReady = true;
  }
}
