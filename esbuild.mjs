import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync } from 'fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });

// Copy pre-built mermaid browser bundle so the webview can load it as a plain
// script tag, avoiding esbuild having to resolve lodash-es internals.
copyFileSync('node_modules/mermaid/dist/mermaid.min.js', 'dist/mermaid.min.js');


const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: !production,
  minify: production,
};

// The webview runs in a browser iframe. mermaid is loaded separately as a plain
// script (dist/mermaid.min.js) so esbuild doesn't have to resolve its deep
// lodash-es dependency tree. Everything else (markdown-it, overlay, thread) is bundled.
const webviewConfig = {
  entryPoints: ['webview/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  sourcemap: !production,
  minify: production,
  external: ['mermaid'],
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"',
    'global': 'globalThis',
  },
};

if (watch) {
  const [extCtx, webCtx] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
  ]);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
  ]);
  console.log('Build complete.');
}
