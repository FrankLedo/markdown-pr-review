import { renderMarkdown } from './renderer';
import { placeOverlays } from './overlay';
import mermaid from 'mermaid';
import type { RenderMessage } from '../src/types';

// acquireVsCodeApi is injected by VS Code into all webview contexts.
// It is not a normal import — it is a global provided by the host at runtime.
declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
// Reserved for future tasks that send messages back to the extension host.
// Declared here so it is only acquired once (VS Code enforces a single call per webview).
// @ts-ignore TS6133 — intentionally unused until a later task needs postMessage
const vscode = acquireVsCodeApi();

window.addEventListener('message', (event: MessageEvent<RenderMessage>) => {
  if (event.data.type === 'render') {
    handleRender(event.data).catch(console.error);
  }
});

async function handleRender(msg: RenderMessage): Promise<void> {
  const content = document.getElementById('content');
  if (!content) return;

  // 1. Render markdown → HTML with data-line attributes
  content.innerHTML = renderMarkdown(msg.markdown);

  // 2. Initialize Mermaid and wait for all diagrams to finish rendering before
  //    placing overlays — otherwise bubbles land on placeholder elements.
  const isDark =
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast');

  mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });

  const mermaidNodes = content.querySelectorAll<HTMLElement>('.mermaid');
  if (mermaidNodes.length > 0) {
    await mermaid.run({ nodes: mermaidNodes });
  }

  // 3. Place comment bubbles now that all DOM elements are in final position
  placeOverlays(content, msg.comments);
}
