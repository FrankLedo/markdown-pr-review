import * as esbuild from 'esbuild';
import { mkdirSync } from 'fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });

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

// The webview runs in a browser iframe. markdown-it and mermaid are bundled
// in so the webview has no external dependencies.
const webviewConfig = {
  entryPoints: ['webview/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  sourcemap: !production,
  minify: production,
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"',
    'global': 'globalThis',
  },
  external: [
    'ts-dedent',
    'd3',
    'dompurify',
    'khroma',
    'cytoscape',
    'dagre-d3-es',
    'entities',
    'mdurl',
    'uc.micro',
    'linkify-it',
    'katex',
    'dayjs',
    'dayjs/plugin/isoWeek.js',
    'dayjs/plugin/customParseFormat.js',
    'dayjs/plugin/advancedFormat.js',
    'elkjs',
    'elkjs/lib/elk.bundled.js',
    'mdast-util-from-markdown',
  ],
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
