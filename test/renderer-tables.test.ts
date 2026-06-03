import assert from 'node:assert/strict';
import { renderMarkdown } from '../webview/renderer';

// GFM table → standard HTML table elements
const out = renderMarkdown(`
| Name | Role |
|------|------|
| Alice | Admin |
| Bob | User |
`);

assert.ok(out.includes('<table'), 'output must contain a <table> element');
assert.ok(out.includes('<th>'), 'output must contain <th> header cells');
assert.ok(out.includes('<td>'), 'output must contain <td> data cells');
assert.ok(out.includes('<tr'), 'output must contain <tr> rows');
assert.ok(out.includes('Alice'), 'table cell content must be present');
assert.ok(out.includes('Bob'), 'table cell content must be present');

// Front-matter tables must not bleed through (they use .pr-front-matter wrapper)
const withFm = renderMarkdown(`---
title: My PR
---

| Col A | Col B |
|-------|-------|
| 1 | 2 |
`);
assert.ok(withFm.includes('class="pr-front-matter"'), 'front matter block must keep its wrapper class');
assert.ok(withFm.includes('<table'), 'body table must still be present after front matter');

console.log('All renderer-tables tests passed ✓');
