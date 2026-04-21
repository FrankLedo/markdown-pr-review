export interface PRComment {
  id: number;
  in_reply_to_id?: number;
  line: number;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}

export interface RenderMessage {
  type: 'render';
  markdown: string;
  comments: PRComment[];
  filePath: string;
  headSha: string;
  currentUserLogin: string;
}

// Messages sent from the webview to the extension host
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'postComment'; line: number; body: string; tempId: number }
  | { type: 'postReply'; inReplyToId: number; line: number; body: string; tempId: number }
  | { type: 'addToDraft'; line: number; body: string }
  | { type: 'submitReview' };

// Messages sent from the extension host to the webview
export type ExtensionMessage =
  | RenderMessage
  | { type: 'commentPosted'; comment: PRComment; tempId: number }
  | { type: 'replyPosted'; comment: PRComment; tempId: number }
  | { type: 'reviewSubmitted'; comments: PRComment[] }
  | { type: 'postError'; message: string; tempId?: number };
