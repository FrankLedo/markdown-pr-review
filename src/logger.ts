import * as vscode from 'vscode';

let _channel: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel('PR Review');
  }
  return _channel;
}

export function log(msg: string): void {
  channel().appendLine(`[${new Date().toISOString()}] ${msg}`);
}

export function logError(msg: string): void {
  const line = `[${new Date().toISOString()}] ERROR: ${msg}`;
  channel().appendLine(line);
  channel().show(true);
}
