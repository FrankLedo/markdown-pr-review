import assert from 'node:assert/strict';
import { renderMarkdown } from '../webview/renderer';

// Issue #19: <details> tags must not appear as raw text
// Issue #20: inner content must be collapsed, not fully exposed

const basic = renderMarkdown(`
<details>
<summary>Click to expand</summary>

Hidden content here.

</details>
`);

// Tags must not appear as literal text
assert.ok(!basic.includes('&lt;details&gt;'), 'raw <details> tag must not appear as escaped text');
assert.ok(!basic.includes('&lt;/details&gt;'), 'raw </details> tag must not appear as escaped text');
assert.ok(!basic.includes('&lt;summary&gt;'), 'raw <summary> tag must not appear as escaped text');

// Must render as a native <details> element
assert.ok(basic.includes('<details'), 'output must contain <details> element');
assert.ok(basic.includes('<summary>'), 'output must contain <summary> element');
assert.ok(basic.includes('Click to expand'), 'summary text must be present');
assert.ok(basic.includes('Hidden content here'), 'inner content must be present (collapsed, not stripped)');

// Inner content must be inside the <details>, not exposed at top level
const detailsStart = basic.indexOf('<details');
const detailsEnd = basic.indexOf('</details>');
assert.ok(detailsStart !== -1 && detailsEnd !== -1, '<details> must open and close');
const insideDetails = basic.slice(detailsStart, detailsEnd);
assert.ok(insideDetails.includes('Hidden content here'), 'inner content must be inside the <details> block');

// Inner markdown must be rendered (not raw text)
const withMarkdown = renderMarkdown(`
<details>
<summary>Details</summary>

- item one
- item two

</details>
`);
assert.ok(withMarkdown.includes('<li'), 'inner markdown list must be rendered as <li> elements');

// Summary may contain inline markdown
const withFormattedSummary = renderMarkdown(`
<details>
<summary>**Bold** summary</summary>

Content.

</details>
`);
assert.ok(withFormattedSummary.includes('<strong>'), 'inline markdown in summary must be rendered');

// Surrounding markdown must be unaffected
const withContext = renderMarkdown(`
Before paragraph.

<details>
<summary>Details</summary>

Hidden.

</details>

After paragraph.
`);
assert.ok(withContext.includes('<p'), 'surrounding paragraphs must still render');
assert.ok(withContext.includes('Before paragraph'), 'content before <details> must render');
assert.ok(withContext.includes('After paragraph'), 'content after <details> must render');

// Multiple <details> blocks
const multi = renderMarkdown(`
<details>
<summary>First</summary>
Alpha.
</details>

<details>
<summary>Second</summary>
Beta.
</details>
`);
assert.ok(multi.includes('First') && multi.includes('Second'), 'multiple <details> blocks must render');
assert.ok(multi.includes('Alpha') && multi.includes('Beta'), 'inner content of multiple blocks must render');

console.log('All renderer-details tests passed ✓');
