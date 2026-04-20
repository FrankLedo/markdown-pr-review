import { execSync } from 'child_process';
import * as vscode from 'vscode';

export interface GitContext {
  owner: string;
  repo: string;
  branch: string;
  repoRoot: string;
}

export function getGitContext(): GitContext {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    throw new Error('No workspace folder open.');
  }

  const run = (cmd: string, errorMsg: string): string => {
    try {
      return execSync(cmd, { cwd: workspaceRoot, encoding: 'utf8' }).trim();
    } catch {
      throw new Error(errorMsg);
    }
  };

  const branch = run('git rev-parse --abbrev-ref HEAD', 'Not a git repository.');
  if (branch === 'HEAD') {
    throw new Error('Not on a branch — check out a PR branch first.');
  }

  const remoteUrl = run('git remote get-url origin', 'No git remote named "origin" found.');
  const repoRoot = run('git rev-parse --show-toplevel', 'Not a git repository.');

  const { owner, repo } = parseGitHubRemote(remoteUrl);
  return { owner, repo, branch, repoRoot };
}

// Exported for testability — parses both HTTPS and SSH remote URLs.
export function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } {
  // https://github.com/owner/repo.git  or  https://github.com/owner/repo
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  // git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
  const match = httpsMatch ?? sshMatch;
  if (!match) {
    throw new Error(`Cannot parse GitHub remote URL: ${remoteUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}
