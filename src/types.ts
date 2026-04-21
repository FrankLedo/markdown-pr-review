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
}
