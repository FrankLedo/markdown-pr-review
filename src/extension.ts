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
  fetchValidLines,
  fetchThreadMeta,
} from './GitHubClient';

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand(
    'markdown-pr-review.openReview',
    async () => {
      const editor = vscode.window.activeTextEditor;
      const isMarkdown =
        editor?.document.languageId === 'markdown' ||
        editor?.document.fileName.endsWith('.md');
      if (!editor || !isMarkdown) {
        const lang = editor ? editor.document.languageId : 'none';
        vscode.window.showErrorMessage(
          `Open a markdown file first. (detected language: ${lang})`
        );
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

            // Resolve symlinks so both paths share the same real prefix.
            // VS Code preserves symlink paths in fsPath (e.g. /Users/fxl/pr-review/...)
            // but git rev-parse --show-toplevel returns the resolved real path.
            const realFilePath = fs.realpathSync(filePath);
            const relPath = path.relative(repoRoot, realFilePath).replace(/\\/g, '/');

            const { token, userLogin } = await getGitHubToken();
            const { prNumber, headSha } = await findPrNumber(owner, repo, branch, token);

            const [comments, validLines, threadMetaResult] = await Promise.allSettled([
              fetchPrComments(owner, repo, prNumber, relPath, token),
              fetchValidLines(owner, repo, prNumber, relPath, token),
              fetchThreadMeta(owner, repo, prNumber, token),
            ]);

            const panel = ReviewPanel.createOrShow(context.extensionUri);
            panel.render(
              markdown,
              comments.status === 'fulfilled' ? comments.value : [],
              threadMetaResult.status === 'fulfilled' ? threadMetaResult.value : [],
              {
                owner,
                repo,
                prNumber,
                headSha,
                filePath: relPath,
                validLines: validLines.status === 'fulfilled' ? validLines.value : [],
                currentUserLogin: userLogin,
              }
            );
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
