import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ReviewPanel } from './ReviewPanel';
import { getGitContext } from './GitContext';
import type { PrFile } from './types';
import {
  getGitHubToken,
  findPrNumber,
  fetchPrFiles,
  fetchPrComments,
  fetchPrCommentCounts,
  fetchThreadMeta,
  type PrFilesResult,
} from './GitHubClient';

function pickInitialFile(mdFiles: string[], activeRelPath: string | null): string {
  if (activeRelPath && mdFiles.includes(activeRelPath)) return activeRelPath;
  return mdFiles[0];
}

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand(
    'markdown-pr-review.openReview',
    async () => {
      const editor = vscode.window.activeTextEditor;
      const anyFilePath = editor?.document.uri.fsPath
        ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      if (!anyFilePath) {
        vscode.window.showErrorMessage('PR Review: Open a workspace or file first.');
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Loading PR comments…',
            cancellable: false,
          },
          async () => {
            const startDir = fs.statSync(anyFilePath).isDirectory()
              ? anyFilePath
              : path.dirname(anyFilePath);
            const { owner, repo, branch, repoRoot } = getGitContext(startDir);

            const { token, userLogin } = await getGitHubToken();
            const { prNumber, headSha } = await findPrNumber(owner, repo, branch, token);

            const { mdFiles, validLinesByPath }: PrFilesResult = await fetchPrFiles(owner, repo, prNumber, token);
            if (mdFiles.length === 0) {
              throw new Error('This PR has no markdown files.');
            }

            // Prefer the active editor's file if it's in the PR diff
            let activeRelPath: string | null = null;
            if (editor) {
              // Resolve symlinks so both paths share the same real prefix
              const realActive = fs.realpathSync(editor.document.uri.fsPath);
              activeRelPath = path.relative(repoRoot, realActive).replace(/\\/g, '/');
            }
            const selectedFile = pickInitialFile(mdFiles, activeRelPath);

            const [comments, counts, threadMetaResult] = await Promise.allSettled([
              fetchPrComments(owner, repo, prNumber, selectedFile, token),
              fetchPrCommentCounts(owner, repo, prNumber, token),
              fetchThreadMeta(owner, repo, prNumber, token),
            ]);

            const commentCounts = counts.status === 'fulfilled' ? counts.value : {};
            const prFiles: PrFile[] = mdFiles.map(p => ({
              path: p,
              commentCount: commentCounts[p] ?? 0,
            }));

            const markdown = fs.readFileSync(path.join(repoRoot, selectedFile), 'utf8');

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
                repoRoot,
                filePath: selectedFile,
                prFiles,
                validLinesByPath,
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
