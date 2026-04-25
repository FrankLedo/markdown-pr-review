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
  fetchThreadMeta,
  type PrFilesResult,
} from './GitHubClient';

function pickInitialFile(mdFiles: string[], activeRelPath: string | null, openByFile: Record<string, number>): string {
  if (activeRelPath && mdFiles.includes(activeRelPath)) return activeRelPath;
  return mdFiles.find(p => (openByFile[p] ?? 0) > 0) ?? mdFiles[0];
}

// null = confirmed no open PR on this branch
let prStatusCache: { branch: string; prNumber: number | null } | undefined;
let statusBarDebounce: ReturnType<typeof setTimeout> | undefined;

async function refreshPrStatusBar(item: vscode.StatusBarItem): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) { item.hide(); return; }
  try {
    const { owner, repo, branch } = getGitContext(workspaceRoot);
    if (prStatusCache?.branch === branch) {
      if (prStatusCache.prNumber == null) { item.hide(); return; }
      item.text = `$(comment-discussion) PR #${prStatusCache.prNumber}`;
      item.show();
      return;
    }
    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
    if (!session) {
      // No auth yet — show generic so user can click to authenticate
      item.text = `$(comment-discussion) Markdown PR Review`;
      item.show();
      return;
    }
    try {
      const { prNumber } = await findPrNumber(owner, repo, branch, session.accessToken);
      prStatusCache = { branch, prNumber };
      item.text = `$(comment-discussion) PR #${prNumber}`;
      item.show();
    } catch {
      // Confirmed no open PR for this branch
      prStatusCache = { branch, prNumber: null };
      item.hide();
    }
  } catch {
    item.hide();
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'markdown-pr-review.openReview';
  statusBarItem.tooltip = 'Markdown PR Review';
  context.subscriptions.push(statusBarItem);

  const scheduleRefresh = () => {
    if (statusBarDebounce) clearTimeout(statusBarDebounce);
    statusBarDebounce = setTimeout(() => refreshPrStatusBar(statusBarItem), 2000);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(scheduleRefresh)
  );

  // Also react to git branch changes so the bar updates without a file switch.
  const gitExt = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: Array<{ state: { onDidChange: vscode.Event<void> } }> } }>('vscode.git');
  if (gitExt?.isActive) {
    for (const repo of gitExt.exports.getAPI(1).repositories) {
      context.subscriptions.push(repo.state.onDidChange(scheduleRefresh));
    }
  }

  refreshPrStatusBar(statusBarItem);

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

            // Resolve active editor path before fetching so we can pick the right initial file
            let activeRelPath: string | null = null;
            if (editor) {
              const realActive = fs.realpathSync(editor.document.uri.fsPath);
              activeRelPath = path.relative(repoRoot, realActive).replace(/\\/g, '/');
            }

            const threadMetaResult = await fetchThreadMeta(owner, repo, prNumber, token).catch(() => []);
            const openByFile: Record<string, number> = {};
            const resolvedByFile: Record<string, number> = {};
            for (const t of threadMetaResult) {
              if (!t.path) continue;
              if (t.isResolved) resolvedByFile[t.path] = (resolvedByFile[t.path] ?? 0) + 1;
              else openByFile[t.path] = (openByFile[t.path] ?? 0) + 1;
            }

            const selectedFile = pickInitialFile(mdFiles, activeRelPath, openByFile);
            const comments = await fetchPrComments(owner, repo, prNumber, selectedFile, token).catch(() => []);

            const prFiles: PrFile[] = mdFiles.map(p => ({
              path: p,
              openCount: openByFile[p] ?? 0,
              resolvedCount: resolvedByFile[p] ?? 0,
            }));

            const markdown = fs.readFileSync(path.join(repoRoot, selectedFile), 'utf8');

            const panel = ReviewPanel.createOrShow(context.extensionUri);
            panel.render(
              markdown,
              comments,
              threadMetaResult,
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
