export interface PRComment {
  id: number;
  node_id: string;
  in_reply_to_id?: number;
  line: number;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
}

export interface ThreadMeta {
  nodeId: string;
  isResolved: boolean;
  rootCommentId: number;
}

export interface RenderMessage {
  type: 'render';
  markdown: string;
  comments: PRComment[];
  threadMeta: ThreadMeta[];
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
  | { type: 'submitReview' }
  | { type: 'editComment'; commentId: number; body: string }
  | { type: 'deleteComment'; commentId: number }
  | { type: 'resolveThread'; threadNodeId: string }
  | { type: 'unresolveThread'; threadNodeId: string };

// Messages sent from the extension host to the webview
export type ExtensionMessage =
  | RenderMessage
  | { type: 'commentPosted'; comment: PRComment; tempId: number; snapped?: boolean }
  | { type: 'replyPosted'; comment: PRComment; tempId: number; snapped?: boolean }
  | { type: 'reviewSubmitted'; comments: PRComment[] }
  | { type: 'postError'; message: string; tempId?: number; source?: 'draft' | 'action' }
  | { type: 'commentEdited'; commentId: number; body: string }
  | { type: 'commentDeleted'; commentId: number }
  | { type: 'threadResolved'; threadNodeId: string }
  | { type: 'threadUnresolved'; threadNodeId: string };
