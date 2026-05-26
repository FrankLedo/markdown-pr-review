---
name: dummy-skill
description: A fake skill used as a manual test fixture for front matter rendering
type: feedback
tags: testing, fixture
version: 2
---

# Dummy Skill

This file is a test fixture for the Markdown PR Review extension. It verifies that
YAML front matter renders as a styled block rather than a raw paragraph.

## What This Skill Does

This skill doesn't do anything real. It exists to exercise front matter rendering
across all four commonly-used front matter field types.

## Usage

Include this file in a PR and use the extension to review it. Verify:

- The front matter block at the top renders as a styled table (not a paragraph)
- Keys appear in a distinct color, values in normal text
- Comment bubbles can be anchored to the front matter block itself
- Comment bubbles can be anchored to the headings and paragraphs below it

## Example Output

A heading after front matter should be independently commentable.
This paragraph is separate from the heading above.

## New Section Added in PR

This section was added in the PR branch. Lines here are in the diff and should show
the normal blue add-comment button. Lines above (unchanged from main) should show the
amber button when outside the diff context.
