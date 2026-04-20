# Distribution

## Channels

Three reasonable paths, in order of ease.

### GitHub Releases (VSIX)

Attach the built `.vsix` to a GitHub release. Users install via:

```bash
gh release download --repo frankledo/markdown-pr-review \
  --pattern '*.vsix'
code --install-extension markdown-pr-review-*.vsix
```

No Marketplace review, no publisher account. Trade-off: no
auto-update.

### VSCode Marketplace

Public listing at `marketplace.visualstudio.com`. Users install with
one click from the Extensions view. Requires:

- Azure DevOps organization and Personal Access Token
- Publisher ID registered at `marketplace.visualstudio.com/manage`
- `vsce publish` from the project

First-publish review typically takes minutes. Subsequent publishes
are near-instant. Auto-update for users.

### Open VSX Registry

Alternative registry maintained by Eclipse. Required for VSCode forks
(VSCodium, Cursor, Gitpod) that cannot legally use the MS Marketplace.
Publishing is `ovsx publish`; same `.vsix` artifact.

## Recommended path

Ship via GitHub Releases during early iteration. Publish to
Marketplace and Open VSX once the extension is stable. Both can be
automated in the same CI release workflow.

## Recommending the extension from a workspace

Any repository can recommend the extension to anyone who opens it by
adding `.vscode/extensions.json`:

```json
{
  "recommendations": ["frankledo.markdown-pr-review"]
}
```

This only works once the extension is on the Marketplace — the
VSCode recommendation prompt cannot install from a local VSIX or a
GitHub Release URL.

## Versioning

Use semantic versioning. Suggested release flow:

- Conventional commits on main
- `semantic-release` bumps version and tags
- CI pipeline runs `vsce package`, then `gh release create`, then
  optionally `vsce publish` and `ovsx publish`
