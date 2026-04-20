import * as vscode from 'vscode';
import { ReviewPanel } from './ReviewPanel';
import type { PRComment } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand(
    'markdown-pr-review.openReview',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Open a markdown file first.');
        return;
      }

      const panel = ReviewPanel.createOrShow(context.extensionUri);

      // MOCK DATA — replaced in Task 9
      const mockComments: PRComment[] = [
        {
          id: 1,
          line: 3,
          body: 'This is a mock comment on line 3.',
          user: { login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231' },
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          in_reply_to_id: 1,
          line: 3,
          body: 'And a reply to that comment.',
          user: { login: 'monalisa', avatar_url: 'https://avatars.githubusercontent.com/u/2' },
          created_at: new Date().toISOString(),
        },
      ];

      panel.render(editor.document.getText(), mockComments, editor.document.uri.fsPath);
    }
  );

  context.subscriptions.push(command);
}

export function deactivate(): void {}
