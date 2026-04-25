# PR Review Test Fixture

This file is the permanent manual test fixture for the Markdown PR Review extension.
It covers every element type the renderer supports. Open a PR that modifies this file,
then use that PR's number to spot-check comment anchoring for each section.

## Paragraphs

This is the first test paragraph. Leave a review comment here to verify that basic
paragraph anchoring works — the comment bubble should appear inline next to this text.

This is a second paragraph immediately below. It should have its own independent
comment anchor, separate from the paragraph above.

A third paragraph with **bold text**, _italic text_, and `inline code` mixed in.
Comment anchoring should still work when the paragraph contains inline formatting.

## Headings

### H3 Heading

Comments anchored to a heading should appear next to the heading text, not the
paragraph that follows it.

#### H4 Heading

A deeper heading to verify that anchor depth doesn't affect comment placement.

## Unordered List

- First item — leave a comment here
- Second item — leave a comment here
  - Nested item — verify nested list anchoring
  - Another nested item
- Third item

## Ordered List

1. First step — comment here to verify ordered list anchoring
2. Second step
3. Third step
   1. Nested step
   2. Another nested step
4. Fourth step

## Fenced Code Block

```typescript
function greet(name: string): string {
  return `Hello, ${name}!`;
}

const result = greet('world');
console.log(result);
```

Comment anchored to a fenced code block lands on the whole block — not
the specific line within it.

## Mermaid Flowchart

Comment on individual nodes and edges below to test semantic bubble placement.
The bubble should land on the specific node or edge, falling back to proportional Y then corner.

```mermaid
flowchart TD
    A[Open markdown file] --> B[Run Open Review Panel]
    B --> C{File has PR comments?}
    C -->|yes| D[Render webview with bubbles]
    C -->|no| E[Show empty state]
    D --> F[Click bubble to expand thread]
    F --> G[Reply, edit, or resolve]
```

## Mermaid Sequence Diagram

Comment on individual messages or actors below to test semantic placement in a sequence diagram.

```mermaid
sequenceDiagram
    participant User
    participant Extension
    participant GitHub
    User->>Extension: Open Review Panel
    Extension->>GitHub: Fetch PR comments
    GitHub-->>Extension: Return comment list
    Extension->>User: Render webview with overlays
    User->>Extension: Click bubble
    Extension->>User: Expand thread panel
```

## Blockquote

> This is a blockquote. It should be independently commentable. The comment
> bubble should appear at the start of the quote block, not at the surrounding paragraph.

Text after the blockquote, to confirm the blockquote and this paragraph get separate anchors.

## Table

| Feature | Status | Notes |
|---|---|---|
| Inline threads | ✅ Done | Anchored via source maps |
| Draft batching | ✅ Done | Submit as one review |
| File switcher | ✅ Done | Dropdown in header |
| Mermaid support | ✅ Done | Anchors to specific node, edge, or message |

## Edge Cases

Adjacent paragraph without a blank line between.
This second line of adjacent text — both lines belong to the same paragraph token.

A paragraph followed immediately by a list:
- Item one
- Item two

> A blockquote followed immediately by another:
> Second blockquote line.

Final paragraph with no trailing newline.