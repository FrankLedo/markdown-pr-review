import * as vscode from 'vscode';

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export class ReviewPanel {
  static currentPanel: ReviewPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];

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
  }

  render(markdown: string, comments: import('./types').PRComment[], filePath: string): void {
    const fileName = filePath.split('/').pop() ?? filePath;
    this._panel.title = `PR Review: ${fileName}`;
    const msg: import('./types').RenderMessage = { type: 'render', markdown, comments, filePath };
    this._panel.webview.postMessage(msg);
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
      padding: 20px;
      line-height: 1.6;
    }
    #content { max-width: 800px; margin: 0 auto; }
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
      width: 14px;
      height: 14px;
      min-width: 14px;
      border-radius: 50%;
      object-fit: cover;
      display: block;
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
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      font-size: 12px;
      opacity: 0.8;
    }
    .pr-thread-avatar { width: 20px; height: 20px; border-radius: 50%; }
    .pr-thread-body { font-size: 13px; word-break: break-word; }
    .pr-thread-body p { margin: 0.3em 0; }
    .pr-thread-body p:first-child { margin-top: 0; }
    .pr-thread-body p:last-child { margin-bottom: 0; }
    .pr-thread-body code { background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.1)); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .pr-thread-body pre { background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.1)); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 0.4em 0; }
    .pr-thread-body pre code { background: none; padding: 0; }
    .mermaid { margin: 1em 0; }
  </style>
</head>
<body>
  <div id="content"><p>Loading&#x2026;</p></div>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    ReviewPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }
}
