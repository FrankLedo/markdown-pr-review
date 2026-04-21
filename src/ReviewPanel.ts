import * as vscode from 'vscode';
import type { PRComment, WebviewMessage } from './types';
import { postComment, postReply, submitDraftReview, getGitHubToken } from './GitHubClient';

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export interface PrContext {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  filePath: string;
  currentUserLogin: string;
}

export class ReviewPanel {
  static currentPanel: ReviewPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];

  private _owner = '';
  private _repo = '';
  private _prNumber = 0;
  private _headSha = '';
  private _filePath = '';
  private _draftComments: Array<{ line: number; body: string }> = [];

  static createOrShow(extensionUri: vscode.Uri): ReviewPanel {
    const column = vscode.ViewColumn.Beside;
    if (ReviewPanel.currentPanel) {
      ReviewPanel.currentPanel._panel.reveal(column);
      return ReviewPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      'markdownPrReview',
      'PR Review',
      column,
      {
        enableScripts: true,
        enableFindWidget: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      }
    );
    ReviewPanel.currentPanel = new ReviewPanel(panel, extensionUri);
    return ReviewPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.webview.html = this._buildHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => { this._handleMessage(msg).catch(console.error); },
      null,
      this._disposables
    );
  }

  render(markdown: string, comments: PRComment[], ctx: PrContext): void {
    this._owner = ctx.owner;
    this._repo = ctx.repo;
    this._prNumber = ctx.prNumber;
    this._headSha = ctx.headSha;
    this._filePath = ctx.filePath;
    this._draftComments = [];

    const fileName = ctx.filePath.split('/').pop() ?? ctx.filePath;
    this._panel.title = `PR Review: ${fileName}`;

    this._panel.webview.postMessage({
      type: 'render',
      markdown,
      comments,
      filePath: ctx.filePath,
      headSha: ctx.headSha,
      currentUserLogin: ctx.currentUserLogin,
    });
  }

  private async _handleMessage(msg: WebviewMessage): Promise<void> {
    if (msg.type === 'ready') return;

    const tempId = (msg as { tempId?: number }).tempId;

    try {
      const { token } = await getGitHubToken();

      if (msg.type === 'postComment') {
        const comment = await postComment(
          this._owner, this._repo, this._prNumber, token,
          { body: msg.body, commitId: this._headSha, path: this._filePath, line: msg.line }
        );
        this._panel.webview.postMessage({ type: 'commentPosted', comment, tempId: msg.tempId });

      } else if (msg.type === 'postReply') {
        const comment = await postReply(
          this._owner, this._repo, this._prNumber, token,
          { body: msg.body, inReplyToId: msg.inReplyToId, fallbackLine: msg.line }
        );
        this._panel.webview.postMessage({ type: 'replyPosted', comment, tempId: msg.tempId });

      } else if (msg.type === 'addToDraft') {
        this._draftComments.push({ line: msg.line, body: msg.body });

      } else if (msg.type === 'submitReview') {
        const comments = await submitDraftReview(
          this._owner, this._repo, this._prNumber, token,
          {
            commitId: this._headSha,
            comments: this._draftComments.map(c => ({ path: this._filePath, line: c.line, body: c.body })),
          }
        );
        this._draftComments = [];
        this._panel.webview.postMessage({ type: 'reviewSubmitted', comments });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage({ type: 'postError', message, tempId });
    }
  }

  dispose(): void {
    if (this._draftComments.length > 0) {
      const n = this._draftComments.length;
      vscode.window.showWarningMessage(
        `You have ${n} pending draft comment${n > 1 ? 's' : ''} that will be lost.`
      );
    }
    ReviewPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }

  private _buildHtml(): string {
    const webview = this._panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
    );
    const mermaidUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'mermaid.min.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PR Review</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 0;
      line-height: 1.6;
    }
    #review-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      padding: 6px 20px;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }
    #review-header:empty { display: none; }
    #content { max-width: 800px; margin: 0 auto; padding: 20px; }
    .pr-bubble {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      border-radius: 10px;
      padding: 2px 7px 2px 4px;
      cursor: pointer;
      float: right;
      font-size: 11px;
      line-height: 1;
      height: 20px;
      box-sizing: border-box;
      margin-left: 8px;
      vertical-align: middle;
    }
    .pr-bubble:hover { opacity: 0.85; }
    .pr-bubble-avatar {
      width: 14px; height: 14px; min-width: 14px;
      border-radius: 50%; object-fit: cover; display: block;
    }
    .pr-thread {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
      border-left: 3px solid var(--vscode-focusBorder, #007acc);
      padding: 8px 12px;
      margin: 6px 0;
      border-radius: 0 4px 4px 0;
      clear: both;
    }
    .pr-thread-item + .pr-thread-item {
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      margin-top: 8px;
      padding-top: 8px;
    }
    .pr-thread-header {
      display: flex; align-items: center; gap: 6px;
      margin-bottom: 4px; font-size: 12px; opacity: 0.8;
    }
    .pr-thread-avatar { width: 20px; height: 20px; border-radius: 50%; }
    .pr-thread-body { font-size: 13px; word-break: break-word; }
    .pr-thread-body p { margin: 0.3em 0; }
    .pr-thread-body p:first-child { margin-top: 0; }
    .pr-thread-body p:last-child { margin-bottom: 0; }
    .pr-thread-body code { background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.1)); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .pr-thread-body pre { background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.1)); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 0.4em 0; }
    .pr-thread-body pre code { background: none; padding: 0; }
    .pr-thread-footer { margin-top: 8px; }
    .pr-reply-btn {
      background: none;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.2));
      color: var(--vscode-editor-foreground);
      padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
    }
    .pr-reply-btn:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
    .mermaid { margin: 1em 0; }
    .pr-add-btn {
      position: fixed;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: none; border-radius: 4px;
      padding: 4px 10px; font-size: 12px; cursor: pointer;
      z-index: 200; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .pr-add-btn:hover { opacity: 0.9; }
    .pr-context-menu {
      position: fixed;
      background: var(--vscode-menu-background, #2d2d2d);
      border: 1px solid var(--vscode-menu-border, rgba(255,255,255,0.2));
      border-radius: 4px; padding: 4px 0;
      z-index: 300; min-width: 140px; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .pr-context-item {
      padding: 6px 14px; font-size: 13px; cursor: pointer;
    }
    .pr-context-item:hover {
      background: var(--vscode-menu-selectionBackground, #094771);
      color: var(--vscode-menu-selectionForeground, #fff);
    }
    .pr-compose {
      border: 1px solid var(--vscode-focusBorder, #007acc);
      border-radius: 4px; padding: 8px; margin: 6px 0;
      background: var(--vscode-input-background, rgba(255,255,255,0.05));
      clear: both;
    }
    .pr-compose textarea {
      width: 100%; min-height: 72px;
      background: var(--vscode-input-background, transparent);
      color: var(--vscode-input-foreground, inherit);
      border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2));
      border-radius: 3px; padding: 6px;
      font-family: var(--vscode-font-family); font-size: 13px;
      resize: vertical; box-sizing: border-box;
    }
    .pr-compose textarea:focus { outline: 1px solid var(--vscode-focusBorder, #007acc); }
    .pr-compose-actions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
    .pr-compose-actions button {
      padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; border: none;
    }
    .pr-btn-primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .pr-btn-primary:hover { opacity: 0.9; }
    .pr-btn-primary:disabled { opacity: 0.5; cursor: default; }
    .pr-btn-secondary {
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
      color: var(--vscode-button-secondaryForeground, inherit);
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.2)) !important;
    }
    .pr-btn-secondary:hover { opacity: 0.9; }
    .pr-btn-secondary:disabled { opacity: 0.5; cursor: default; }
    .pr-compose-error { color: var(--vscode-errorForeground, #f48771); font-size: 12px; margin-top: 4px; display: none; }
    .pr-draft-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      border-radius: 12px; padding: 4px 12px; font-size: 12px;
    }
    .pr-draft-submit {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: none; border-radius: 4px; padding: 3px 10px; font-size: 12px; cursor: pointer;
    }
    .pr-draft-submit:hover { opacity: 0.9; }
    .pr-draft-error { color: var(--vscode-errorForeground, #f48771); font-size: 12px; margin-left: 8px; display: none; }
    .pr-toast {
      position: fixed; bottom: 20px; right: 20px;
      background: var(--vscode-errorForeground, #f48771); color: #fff;
      padding: 8px 16px; border-radius: 4px; font-size: 13px;
      z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div id="review-header"></div>
  <div id="content"><p>Loading&#x2026;</p></div>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
