import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewPanel } from './ReviewPanel';
import { getGitContext } from './GitContext';
import { getGitHubToken, findPrNumber, fetchPrComments } from './GitHubClient';

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand(
    'markdown-pr-review.openReview',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Open a markdown file first.');
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const markdown = editor.document.getText();

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Loading PR comments…',
            cancellable: false,
          },
          async () => {
            const { owner, repo, branch, repoRoot } = getGitContext(path.dirname(filePath));

            // Convert absolute file path to repo-relative path with forward slashes
            // (GitHub API uses forward slashes on all platforms)
            const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

            const token = await getGitHubToken();
            const prNumber = await findPrNumber(owner, repo, branch, token);
            const comments = await fetchPrComments(owner, repo, prNumber, relPath, token);

            const panel = ReviewPanel.createOrShow(context.extensionUri);
            panel.render(markdown, comments, relPath);
          }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`PR Review: ${message}`);
      }
    }
  );

  context.subscriptions.push(command);
}

export function deactivate(): void {}
