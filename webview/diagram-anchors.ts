import type { PRComment } from '../src/types';

export type Point = { x: number; y: number };
export type DiagramType = 'flowchart' | 'sequence' | 'unknown';

export function detectDiagramType(source: string): DiagramType {
  const first = source.trimStart().toLowerCase();
  if (first.startsWith('flowchart') || first.startsWith('graph ')) return 'flowchart';
  if (first.startsWith('sequencediagram')) return 'sequence';
  return 'unknown';
}

export function extractFlowchartNodeId(sourceLine: string): string | null {
  const m = sourceLine.trim().match(/^([A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}

export function extractSequenceActor(sourceLine: string): string | null {
  const decl = sourceLine.trim().match(/^(?:participant|actor)\s+(\S+)/i);
  if (decl) return decl[1];
  const msg = sourceLine.trim().match(/^(\S+?)(?:[-~][-~>)]+)/);
  if (msg) return msg[1];
  return null;
}
