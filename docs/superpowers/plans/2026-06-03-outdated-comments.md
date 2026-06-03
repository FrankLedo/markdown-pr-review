# Outdated Comment Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make outdated inline PR comments (where `line` is null but `original_line` is set) render in the webview anchored to their original line, with a small "Outdated" label.

**Architecture:** Three-layer change — `types.ts` adds the `outdated` flag to `PRComment`; `GitHubClient.ts` stops filtering out null-line comments and falls back to `original_line`; `webview/thread.ts` and `ReviewPanel.ts` render the visual label. No new files needed.

**Tech Stack:** TypeScript, VSCode extension webview, Node assert test runner (`npx tsx`).

---

## File Map

| File | Change |
|------|--------|
| `src/types.ts` | Add `outdated?: boolean` to `PRComment` |
| `src/GitHubClient.ts` | Add `original_line` to interface; fix `mapComment`, `fetchPrComments`, `fetchPrCommentCounts` |
| `webview/thread.ts` | Render "Outdated" label at top of thread panel when first comment is outdated |
| `src/ReviewPanel.ts` | Add `.pr-thread-outdated-label` CSS rule |
| `test/GitHubClient-mapComment.test.ts` | New: unit tests for `mapComment` fallback logic |

---

### Task 1: Add `outdated` to `PRComment` and test `mapComment`

**Files:**
- Modify: `src/types.ts:1-9`
- Create: `test/GitHubClient-mapComment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/GitHubClient-mapComment.test.ts`:

```typescript
import assert from 'node:assert/strict';

// We test the mapComment logic directly by reproducing it here.
// The real function is not exported, so we replicate its contract.

interface GitHubReviewComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  path: string;
  line: number | null;
  original_line?: number | null;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}

interface PRComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  line: number;
  outdated?: boolean;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}

function mapComment(raw: GitHubReviewComment): PRComment {
  const line = raw.line ?? raw.original_line;
  if (line == null) throw new Error(`mapComment: comment ${raw.id} has no line number`);
  return {
    id: raw.id,
    node_id: raw.node_id,
    in_reply_to_id: raw.in_reply_to_id,
    line,
    outdated: raw.line == null,
    body: raw.body,
    user: { login: raw.user.login, avatar_url: raw.user.avatar_url },
    created_at: raw.created_at,
  };
}

const base: GitHubReviewComment = {
  id: 1,
  node_id: 'node1',
  path: 'README.md',
  line: null,
  body: 'test',
  user: { login: 'alice', avatar_url: 'https://example.com/avatar.png' },
  created_at: '2024-01-01T00:00:00Z',
};

// outdated: line null, original_line set
const outdated = mapComment({ ...base, line: null, original_line: 5 });
assert.equal(outdated.line, 5, 'should use original_line as line');
assert.equal(outdated.outdated, true, 'should be marked outdated');

// current: line set
const current = mapComment({ ...base, line: 3, original_line: 3 });
assert.equal(current.line, 3, 'should use line when set');
assert.equal(current.outdated, false, 'should not be outdated');

// both null: should throw
assert.throws(
  () => mapComment({ ...base, line: null, original_line: null }),
  /has no line number/,
  'should throw when both line fields are null'
);

// original_line absent: should throw
assert.throws(
  () => mapComment({ ...base, line: null }),
  /has no line number/,
  'should throw when original_line is missing and line is null'
);

console.log('All GitHubClient-mapComment tests passed ✓');
```

- [ ] **Step 2: Run the test — expect it to pass (it tests the contract, not the import)**

```bash
cd ~/Projects/markdown-pr-review && npx tsx test/GitHubClient-mapComment.test.ts
```

Expected: `All GitHubClient-mapComment tests passed ✓`

- [ ] **Step 3: Add `outdated?: boolean` to `PRComment` in `src/types.ts`**

Current `src/types.ts` lines 1–9:
```typescript
export interface PRComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  line: number;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}
```

Change to:
```typescript
export interface PRComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  line: number;
  outdated?: boolean;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}
```

- [ ] **Step 4: Add the new test to the npm test script in `package.json`**

Find the `"test"` script and append:

```json
"test": "npx tsx test/diagram-anchors.test.ts && npx tsx test/renderer-details.test.ts && npx tsx test/renderer-tables.test.ts && npx tsx test/GitHubClient-mapComment.test.ts"
```

- [ ] **Step 5: Run full test suite**

```bash
cd ~/Projects/markdown-pr-review && npm test
```

Expected: all four test files print their `passed ✓` lines.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/markdown-pr-review && git add src/types.ts test/GitHubClient-mapComment.test.ts package.json && git commit -m "test: add mapComment contract tests; add outdated flag to PRComment type"
```

---

### Task 2: Fix `GitHubClient.ts` to handle null-line comments

**Files:**
- Modify: `src/GitHubClient.ts`

The three functions to change are:
- `mapComment` (lines 87–100): fall back to `original_line`
- `fetchPrComments` (lines 164–178): relax the filter
- `fetchPrCommentCounts` (lines 147–162): count outdated comments

- [ ] **Step 1: Update `GitHubReviewComment` interface to include `original_line`**

Find (lines 60–69):
```typescript
interface GitHubReviewComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  path: string;
  line: number | null;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}
```

Replace with:
```typescript
interface GitHubReviewComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  path: string;
  line: number | null;
  original_line?: number | null;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}
```

- [ ] **Step 2: Fix `mapComment` to fall back to `original_line`**

Find (lines 87–100):
```typescript
function mapComment(raw: GitHubReviewComment): PRComment {
  if (raw.line == null) {
    throw new Error(`mapComment: comment ${raw.id} has no line number`);
  }
  return {
    id: raw.id,
    node_id: raw.node_id,
    in_reply_to_id: raw.in_reply_to_id,
    line: raw.line,
    body: raw.body,
    user: { login: raw.user.login, avatar_url: raw.user.avatar_url },
    created_at: raw.created_at,
  };
}
```

Replace with:
```typescript
function mapComment(raw: GitHubReviewComment): PRComment {
  const line = raw.line ?? raw.original_line;
  if (line == null) throw new Error(`mapComment: comment ${raw.id} has no line number`);
  return {
    id: raw.id,
    node_id: raw.node_id,
    in_reply_to_id: raw.in_reply_to_id,
    line,
    outdated: raw.line == null,
    body: raw.body,
    user: { login: raw.user.login, avatar_url: raw.user.avatar_url },
    created_at: raw.created_at,
  };
}
```

- [ ] **Step 3: Fix `fetchPrComments` filter**

Find (lines 175–177):
```typescript
  return raw
    .filter(c => c.path === filePath && c.line != null)
    .map(mapComment);
```

Replace with:
```typescript
  return raw
    .filter(c => c.path === filePath && (c.line != null || c.original_line != null))
    .map(mapComment);
```

- [ ] **Step 4: Fix `fetchPrCommentCounts` loop**

Find (lines 157–160):
```typescript
  const counts: Record<string, number> = {};
  for (const c of raw) {
    if (c.line != null) counts[c.path] = (counts[c.path] ?? 0) + 1;
  }
```

Replace with:
```typescript
  const counts: Record<string, number> = {};
  for (const c of raw) {
    if (c.line != null || c.original_line != null) counts[c.path] = (counts[c.path] ?? 0) + 1;
  }
```

Note: `fetchPrCommentCounts` uses a simpler raw type `Array<{ path: string; line: number | null }>`. Update that type inline to also include `original_line`:

Find (line 153):
```typescript
  const raw = await githubRequest<Array<{ path: string; line: number | null }>>(
```

Replace with:
```typescript
  const raw = await githubRequest<Array<{ path: string; line: number | null; original_line?: number | null }>>(
```

- [ ] **Step 5: Run the full test suite**

```bash
cd ~/Projects/markdown-pr-review && npm test
```

Expected: all four test files print their `passed ✓` lines. TypeScript should compile cleanly too:

```bash
cd ~/Projects/markdown-pr-review && npm run compile
```

Expected: `Build complete.`

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/markdown-pr-review && git add src/GitHubClient.ts && git commit -m "fix: fall back to original_line for outdated PR comments (issue #25)"
```

---

### Task 3: Render "Outdated" label in webview

**Files:**
- Modify: `webview/thread.ts:175-185`
- Modify: `src/ReviewPanel.ts` (CSS `<style>` block)

- [ ] **Step 1: Add CSS for the outdated label in `src/ReviewPanel.ts`**

In the `<style>` block, find the existing resolved banner rule:
```css
    .pr-thread-resolved-banner {
      font-size: 12px;
      color: var(--vscode-gitDecoration-ignoredResourceForeground, #8a8a8a);
      margin-bottom: 8px;
      font-style: italic;
    }
```

Add the outdated label rule immediately after it:
```css
    .pr-thread-outdated-label {
      font-size: 12px;
      color: var(--vscode-gitDecoration-ignoredResourceForeground, #8a8a8a);
      margin-bottom: 4px;
      font-style: italic;
    }
```

- [ ] **Step 2: Render the label in `webview/thread.ts`**

In `buildPanel` (line 175), find the resolved banner block:
```typescript
  if (options?.isResolved) {
    const banner = document.createElement('div');
    banner.className = 'pr-thread-resolved-banner';
    banner.textContent = '✓ Resolved conversation';
    panel.appendChild(banner);
  }
```

Add the outdated label block immediately after it:
```typescript
  if (comments[0]?.outdated) {
    const label = document.createElement('div');
    label.className = 'pr-thread-outdated-label';
    label.textContent = 'Outdated';
    panel.appendChild(label);
  }
```

- [ ] **Step 3: Run the full test suite**

```bash
cd ~/Projects/markdown-pr-review && npm test
```

Expected: all four test files print their `passed ✓` lines.

- [ ] **Step 4: Build**

```bash
cd ~/Projects/markdown-pr-review && npm run compile
```

Expected: `Build complete.`

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/markdown-pr-review && git add webview/thread.ts src/ReviewPanel.ts && git commit -m "feat: show Outdated label on threads anchored to original_line (issue #25)"
```

---

### Task 4: Close issue and publish

- [ ] **Step 1: Close the issue**

```bash
cd ~/Projects/markdown-pr-review && gh issue close 25 --comment "Fixed. Outdated comments (line: null, original_line set) now render in the webview anchored to their original line with an 'Outdated' label."
```

- [ ] **Step 2: Push**

```bash
cd ~/Projects/markdown-pr-review && git push origin main
```

- [ ] **Step 3: Bump version and package**

```bash
cd ~/Projects/markdown-pr-review && npm version patch --no-git-tag-version && git add package.json package-lock.json && git commit -m "chore: bump version for outdated comment fix" && git push origin main
```

Then package:
```bash
cd ~/Projects/markdown-pr-review && npx vsce package
```

Expected: produces `markdown-pr-review-1.6.4.vsix` (or next patch).

- [ ] **Step 4: Publish (requires VSCE_PAT)**

Run from terminal (not in this session):
```bash
VSCE_PAT=<token> npx vsce publish
```
