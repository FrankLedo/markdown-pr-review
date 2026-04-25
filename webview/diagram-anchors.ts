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
  // participant/actor declarations — prefer alias over quoted/plain name
  const declMatch = sourceLine.trim().match(
    /^(?:participant|actor)\s+(?:"[^"]*"|\S+)(?:\s+as\s+(\S+))?/i
  );
  if (declMatch) {
    if (declMatch[1]) return declMatch[1]; // has alias: return it
    // plain unquoted name: extract it
    const plain = sourceLine.trim().match(/^(?:participant|actor)\s+([A-Za-z0-9_]+)/i);
    return plain ? plain[1] : null;
  }
  // message line: extract sender actor (includes -x arrow for cross)
  const msg = sourceLine.trim().match(/^(\S+?)(?:[-~][-~>)x]+)/);
  if (msg) return msg[1];
  return null;
}
