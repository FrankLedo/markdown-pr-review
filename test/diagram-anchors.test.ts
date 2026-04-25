import assert from 'node:assert/strict';
import { detectDiagramType, extractFlowchartNodeId, extractSequenceActor } from '../webview/diagram-anchors';

// detectDiagramType
assert.equal(detectDiagramType('flowchart TD\nA --> B'), 'flowchart');
assert.equal(detectDiagramType('flowchart LR\nA --> B'), 'flowchart');
assert.equal(detectDiagramType('graph TD\nA --> B'), 'flowchart');
assert.equal(detectDiagramType('graph LR\nA --> B'), 'flowchart');
assert.equal(detectDiagramType('sequenceDiagram\nA->>B: hi'), 'sequence');
assert.equal(detectDiagramType('  sequenceDiagram\nA->>B: hi'), 'sequence');
assert.equal(detectDiagramType('pie title Pets\n"Dogs": 40'), 'unknown');
assert.equal(detectDiagramType(''), 'unknown');

// extractFlowchartNodeId
assert.equal(extractFlowchartNodeId('    A[Open markdown file]'), 'A');
assert.equal(extractFlowchartNodeId('    B --> C'), 'B');
assert.equal(extractFlowchartNodeId('    C{Decision?}'), 'C');
assert.equal(extractFlowchartNodeId('    D(rounded)'), 'D');
assert.equal(extractFlowchartNodeId('    B -->|yes| C'), 'B');
assert.equal(extractFlowchartNodeId('    style A fill:#fff'), 'style');
assert.equal(extractFlowchartNodeId(''), null);
assert.equal(extractFlowchartNodeId('    '), null);

// extractSequenceActor
assert.equal(extractSequenceActor('    participant User'), 'User');
assert.equal(extractSequenceActor('    actor GitHub'), 'GitHub');
assert.equal(extractSequenceActor('    User->>Extension: Fetch PR comments'), 'User');
assert.equal(extractSequenceActor('    Extension-->>User: Return comment list'), 'Extension');
assert.equal(extractSequenceActor('    User->>Extension: Open Review Panel'), 'User');
assert.equal(extractSequenceActor('    Note over User: text'), null);
assert.equal(extractSequenceActor('    loop Every second'), null);
assert.equal(extractSequenceActor(''), null);

console.log('All diagram-anchors tests passed ✓');
