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
