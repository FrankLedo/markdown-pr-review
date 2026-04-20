import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type Renderer from 'markdown-it/lib/renderer.mjs';
import type { Options } from 'markdown-it';

export function renderMarkdown(source: string): string {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

  // Enable source maps so token.map = [startLine, endLine] is populated on block tokens.
  (md.options as Record<string, unknown>)['sourceMap'] = true;

  // Inject data-line="N" on every opening block tag that has a source map.
  // This is what makes comment anchoring possible — overlay.ts finds the element
  // whose data-line is closest to the comment's line number.
  const originalRenderToken = md.renderer.renderToken.bind(md.renderer);
  md.renderer.renderToken = (tokens: Token[], idx: number, options: Options): string => {
    const token = tokens[idx];
    if (token.map && token.nesting === 1) {
      token.attrSet('data-line', String(token.map[0]));
    }
    return originalRenderToken(tokens, idx, options);
  };

  // Replace fenced ```mermaid blocks with <div class="mermaid"> so mermaid.run() picks them up.
  const defaultFence = md.renderer.rules['fence'] as
    | ((tokens: Token[], idx: number, options: Options, env: unknown, self: Renderer) => string)
    | undefined;

  md.renderer.rules['fence'] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().toLowerCase();
    if (lang === 'mermaid') {
      const lineAttr = token.map ? ` data-line="${token.map[0]}"` : '';
      return `<div class="mermaid"${lineAttr}>${escapeHtml(token.content)}</div>\n`;
    }
    if (token.map) {
      token.attrSet('data-line', String(token.map[0]));
    }
    if (defaultFence) {
      return defaultFence(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };

  return md.render(source);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
