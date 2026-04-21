import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ReviewPanel } from './ReviewPanel';
import { getGitContext } from './GitContext';
import type { ThreadMeta } from './types';
import {
  getGitHubToken,
  findPrNumber,
  fetchPrComments,
  fetchThreadMeta,
} from './GitHubClient';

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

            const realFilePath = fs.realpathSync(filePath);
            const relPath = path.relative(repoRoot, realFilePath).replace(/\\/g, '/');

            const { token, userLogin } = await getGitHubToken();
            const { prNumber, headSha } = await findPrNumber(owner, repo, branch, token);
            const comments = await fetchPrComments(owner, repo, prNumber, relPath, token);

            // Non-fatal: if GraphQL fails, render without thread metadata
            let threadMeta: ThreadMeta[] = [];
            try {
              threadMeta = await fetchThreadMeta(owner, repo, prNumber, token);
            } catch (err) {
              console.warn('fetchThreadMeta failed:', err);
            }

            const panel = ReviewPanel.createOrShow(context.extensionUri);
            panel.render(markdown, comments, threadMeta, {
              owner,
              repo,
              prNumber,
              headSha,
              filePath: relPath,
              currentUserLogin: userLogin,
            });
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
