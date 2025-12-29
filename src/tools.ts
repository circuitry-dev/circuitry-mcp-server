/**
 * Circuitry MCP Server v2 - Focused Tool Set
 *
 * Minimal tools for Claude Code CLI to interact with Circuitry.
 * Complex tasks delegate to Circuitry's chat agent.
 */

import { z } from 'zod'
import type { ToolDefinition } from './types.js'

// ============================================================================
// Connection & Status Tools
// ============================================================================

const connectionTools: ToolDefinition[] = [
  {
    name: 'circuitry.status',
    namespace: 'circuitry',
    description: 'Check connection status to Circuitry.',
    parameters: [],
    returns: { type: '{ connected, approved, version }', description: 'Connection status' }
  },
  {
    name: 'circuitry.connect',
    namespace: 'circuitry',
    description: 'Request connection to Circuitry. Shows permission dialog in Circuitry for user approval. Call this first before using other tools.',
    parameters: [],
    returns: { type: '{ approved, message }', description: 'Whether connection was approved' }
  },
  {
    name: 'circuitry.disconnect',
    namespace: 'circuitry',
    description: 'Disconnect from Circuitry. Ends the current MCP session. Call circuitry.connect to reconnect.',
    parameters: [],
    returns: { type: '{ disconnected, message }', description: 'Whether disconnection was successful' }
  }
]

// ============================================================================
// Workflow Understanding Tools (for Claude CLI to comprehend user-drawn flows)
// ============================================================================

const workflowTools: ToolDefinition[] = [
  {
    name: 'workflow.getActive',
    namespace: 'workflow',
    description: 'Get info about the currently visible workflow.',
    parameters: [],
    returns: { type: '{ id, name, nodeCount, edgeCount }', description: 'Active workflow info' }
  },
  {
    name: 'workflow.getStructure',
    namespace: 'workflow',
    description: 'Get simplified structure of all flows in the workflow. Use this to understand what user has drawn.',
    parameters: [],
    returns: { type: '{ flows: Array<{ id, name, nodeIds, summary }> }', description: 'Simplified workflow structure' }
  },
  {
    name: 'workflow.resolveFlow',
    namespace: 'workflow',
    description: 'Resolve a user reference like "this flow" or "the diagram I drew" to specific nodes. Uses flow resolver to identify which flow/nodes user is referring to.',
    parameters: [
      { name: 'userMessage', type: 'string', description: 'The user message that references a flow', required: true }
    ],
    returns: {
      type: 'FlowResolutionResult',
      description: '{ type, flowId, flowName, nodeIds, edgeIds, nodeNameMap, confidence, reasoning }'
    }
  },
  {
    name: 'workflow.getNodeSummary',
    namespace: 'workflow',
    description: 'Get simplified details about nodes. Returns name, type, and connections - enough for Claude CLI to understand the diagram.',
    parameters: [
      { name: 'nodeIds', type: 'array', description: 'Array of node IDs to get details for (optional - defaults to all)', required: false }
    ],
    returns: { type: 'Array<{ id, name, type, inputs, outputs }>', description: 'Simplified node details' }
  },
  {
    name: 'workflow.getFlowcharts',
    namespace: 'workflow',
    description: 'Get existing flow nodes to modify. Use before updateFlowchart to see what exists.',
    parameters: [],
    returns: {
      type: 'Array<{ id, name, shape, color, connections: { to, label }[] }>',
      description: 'All flow nodes with their IDs, properties, and outgoing connections'
    }
  },
  {
    name: 'workflow.layoutNodes',
    namespace: 'workflow',
    description: 'Auto-layout specific nodes using dagre (longest-path algorithm). Positions nodes and optimizes edge handles for clean flowchart appearance.',
    parameters: [
      { name: 'nodeIds', type: 'array', description: 'Array of node IDs to layout. Omit to layout all connected nodes.', required: false },
      { name: 'direction', type: 'string', description: 'Layout direction: "vertical" (default) or "horizontal"', required: false, enum: ['vertical', 'horizontal'] },
      { name: 'spacing', type: 'number', description: 'Gap between nodes in pixels (default: 80)', required: false }
    ],
    returns: {
      type: '{ layoutedCount: number, nodeIds: string[] }',
      description: 'Number of nodes layouted and their IDs'
    }
  },
  {
    name: 'workflow.undo',
    namespace: 'workflow',
    description: 'Undo the last workflow change. Reverts nodes, edges, and drawing data to previous state. Use this when changes need to be reverted or the user asks to undo.',
    parameters: [],
    returns: {
      type: 'boolean',
      description: 'true if undo was successful, false if nothing to undo'
    }
  },
  {
    name: 'workflow.redo',
    namespace: 'workflow',
    description: 'Redo the last undone change. Restores nodes, edges, and drawing data to the next state.',
    parameters: [],
    returns: {
      type: 'boolean',
      description: 'true if redo was successful, false if nothing to redo'
    }
  },
  {
    name: 'workflow.canUndo',
    namespace: 'workflow',
    description: 'Check if undo is available. Call before undo to verify there are changes to revert.',
    parameters: [],
    returns: {
      type: 'boolean',
      description: 'true if there are changes that can be undone'
    }
  },
  {
    name: 'workflow.canRedo',
    namespace: 'workflow',
    description: 'Check if redo is available. Call before redo to verify there are changes to restore.',
    parameters: [],
    returns: {
      type: 'boolean',
      description: 'true if there are changes that can be redone'
    }
  },
  {
    name: 'workflow.getSelectionContext',
    namespace: 'workflow',
    description: 'Get currently selected nodes and what is selected within them (cells in sheets, text in code/text/agent nodes). Use this to understand what the user is referring to when they say "this", "what does this do?", "explain this", etc. Returns empty array if nothing is selected.',
    parameters: [],
    returns: {
      type: 'object',
      description: 'Selection context with selectedNodes array. Each node has: nodeId, name, type, and optional cellSelection (for sheets: range like "A1:B5", cells array, values) or textSelection (for code/text/agent: text content, startLine, endLine)'
    }
  }
]

// ============================================================================
// Direct CRUD Tools (simple operations MCP handles directly)
// ============================================================================

const nodeTools: ToolDefinition[] = [
  {
    name: 'nodes.list',
    namespace: 'nodes',
    description: 'List all nodes in the active workflow.',
    parameters: [],
    returns: { type: 'NodeInfo[]', description: 'Array of all nodes with id, type, name, position, data' }
  },
  {
    name: 'nodes.get',
    namespace: 'nodes',
    description: 'Get a specific node by its ID.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'The unique ID of the node', required: true }
    ],
    returns: { type: 'NodeInfo | null', description: 'Node info or null if not found' }
  },
  {
    name: 'nodes.search',
    namespace: 'nodes',
    description: `Search workflow nodes by name or content. Returns ALL matches with confidence scores - let AI decide which is most relevant.

Use cases:
- "the validation node" → searches for nodes with "validation" in name
- "sheet with customer data" → searches sheet headers and data sample
- "authentication code" → searches code node contents

Content searched by type:
- sheet: headers + first 100 rows of data
- code: first 1000 chars
- text/agent: full content
- flow: displayName + content

Large sheets (>1000 rows) are skipped by default to avoid slowness. Use includeLargeSheets: true to include them.`,
    parameters: [
      { name: 'query', type: 'string', description: 'Search term (natural language supported)', required: true },
      { name: 'limit', type: 'number', description: 'Max results to return (default: 20)', required: false },
      { name: 'types', type: 'array', description: 'Filter by node types (e.g., ["code", "sheet"])', required: false },
      { name: 'searchContent', type: 'boolean', description: 'Include content search (default: true)', required: false },
      { name: 'includeLargeSheets', type: 'boolean', description: 'Search sheets with >1000 rows (default: false, may be slow)', required: false }
    ],
    returns: {
      type: '{ results: NodeSearchResult[], skippedLargeSheets?: SkippedLargeSheet[] }',
      description: 'Results sorted by confidence (1.0=exact, 0.7-0.9=partial, 0.6=content). Skipped sheets listed if any.'
    }
  },
  {
    name: 'nodes.update',
    namespace: 'nodes',
    description: "Update a node's data/configuration.",
    parameters: [
      { name: 'nodeId', type: 'string', description: 'ID of the node to update', required: true },
      { name: 'data', type: 'object', description: 'Data to merge into node', required: true }
    ],
    returns: { type: 'boolean', description: 'True if update succeeded' }
  },
  {
    name: 'nodes.delete',
    namespace: 'nodes',
    description: 'Delete a node from the workflow.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'ID of the node to delete', required: true }
    ],
    returns: { type: 'boolean', description: 'True if deletion succeeded' }
  },
  {
    name: 'nodes.createFlowchart',
    namespace: 'nodes',
    description: `Create a flowchart with nodes and edges on the canvas. Returns nodeIds mapping for subsequent modifications via nodes.updateFlowchart.

**Nodes:** { id, name, shape?, color? }
- shape: rounded (default), diamond (decisions), pill (start/end), cylinder (database), parallelogram (I/O)
- color: CSS name (blue, green, red, amber) or hex. Use red for problems, green for success.

**Edges:** { from, to, fromHandle?, toHandle?, label? }
- handles: "left", "right", "top", "bottom"
- For decisions: fromHandle "right" for Yes/true, "bottom" for No/false`,
    parameters: [
      {
        name: 'nodes',
        type: 'array',
        description: 'Array of nodes: [{id, name, shape?, color?}]',
        required: true
      },
      {
        name: 'edges',
        type: 'array',
        description: 'Array of edges: [{from, to, fromHandle?, toHandle?, label?}]',
        required: true
      },
      {
        name: 'startPosition',
        type: 'object',
        description: 'Starting position {x, y} for the flowchart',
        required: false
      },
      {
        name: 'spacing',
        type: 'number',
        description: 'Gap between nodes in pixels (default: 60)',
        required: false
      },
      {
        name: 'autoLayout',
        type: 'boolean',
        description: 'Run dagre auto-layout after creating nodes for optimal positioning (default: false)',
        required: false
      }
    ],
    returns: {
      type: '{ nodeIds: Record<string, string>, edgeIds: string[], nodeCount: number, edgeCount: number }',
      description: 'Map of logical IDs to actual node IDs, edge IDs, and counts'
    }
  },
  {
    name: 'nodes.updateFlowchart',
    namespace: 'nodes',
    description: 'Update an existing flowchart. Pass nodeIds from createFlowchart response to modify nodes/edges.',
    parameters: [
      {
        name: 'nodeIds',
        type: 'object',
        description: 'Map of logical IDs to actual node IDs (from createFlowchart response)',
        required: true
      },
      {
        name: 'add',
        type: 'object',
        description: '{ nodes: [{id, name, shape?, color?}], edges: [{from, to, label?}] } - new nodes/edges to add',
        required: false
      },
      {
        name: 'update',
        type: 'object',
        description: '{ "actualNodeId": { displayName?, color?, shape? } } - update existing nodes by actual ID',
        required: false
      },
      {
        name: 'remove',
        type: 'object',
        description: '{ nodeIds?: string[], edgeIds?: string[] } - actual IDs to remove',
        required: false
      }
    ],
    returns: {
      type: '{ added: { nodeIds, edgeIds }, updated: string[], removed: { nodeIds, edgeIds } }',
      description: 'Summary of changes made'
    }
  },
  {
    name: 'nodes.insertBetween',
    namespace: 'nodes',
    description: `Insert node(s) between two connected nodes. Removes existing edge and creates new edges through the inserted nodes.

Use \`node\` for single insertion: Source → NewNode → Target
Use \`nodes\` for chain insertion: Source → A → B → C → Target`,
    parameters: [
      { name: 'sourceId', type: 'string', description: 'Source node ID (start of existing edge)', required: true },
      { name: 'targetId', type: 'string', description: 'Target node ID (end of existing edge)', required: true },
      {
        name: 'node',
        type: 'object',
        description: '{ name, shape?, color? } - single node to insert (use OR nodes, not both)',
        required: false
      },
      {
        name: 'nodes',
        type: 'array',
        description: '[{ name, shape?, color? }] - array of nodes to insert in sequence (use OR node, not both)',
        required: false
      }
    ],
    returns: {
      type: '{ nodeIds, removedEdgeId, newEdgeIds, nodeId? }',
      description: 'Created node IDs, removed edge ID, and new edge IDs. nodeId included for single-node backward compatibility.'
    }
  }
]

// ============================================================================
// Edge Tools (for modifying connections between nodes)
// ============================================================================

const edgeTools: ToolDefinition[] = [
  {
    name: 'edges.deleteBetween',
    namespace: 'edges',
    description: 'Delete all edges between two nodes. More intuitive than needing edge IDs.',
    parameters: [
      { name: 'sourceId', type: 'string', description: 'Source node ID', required: true },
      { name: 'targetId', type: 'string', description: 'Target node ID', required: true }
    ],
    returns: { type: 'number', description: 'Count of edges deleted' }
  }
]

const codeTools: ToolDefinition[] = [
  {
    name: 'code.create',
    namespace: 'code',
    description: 'Create a code node. Use filePath for bidirectional file sync, OR use name+content for direct creation.',
    parameters: [
      { name: 'filePath', type: 'string', description: 'Absolute path to source file (enables bidirectional sync)', required: false },
      { name: 'name', type: 'string', description: 'Display name for the node', required: false },
      { name: 'content', type: 'string', description: 'Code content (used when not using filePath)', required: false },
      { name: 'position', type: 'object', description: 'Position {x, y} on canvas', required: false }
    ],
    returns: { type: 'string', description: 'ID of created code node' }
  },
  {
    name: 'code.createBatch',
    namespace: 'code',
    description: 'Create multiple code nodes from file paths. EServer fetches files and sets up sync.',
    parameters: [
      { name: 'filePaths', type: 'array', description: 'Array of absolute file paths', required: true },
      { name: 'layout', type: 'string', description: 'How to arrange nodes', required: false, enum: ['grid', 'vertical', 'horizontal'] }
    ],
    returns: { type: '{ nodeIds: string[], errors: string[] }', description: 'Created node IDs and any errors' }
  },
  {
    name: 'code.createBatchGrouped',
    namespace: 'code',
    description: `Create code nodes organized in named groups with flow node headers.
Each group gets a label header (flow node) with its code files arranged below it.
Groups are placed side-by-side (horizontal) or stacked (vertical).

IMPORTANT: Provide descriptive names for each file. For Next.js page.tsx files, derive the name from the folder path (e.g., "/app/login/page.tsx" → "Login", "/app/dashboard/settings/page.tsx" → "Dashboard Settings"). Avoid generic names like "page" or "index".

Example: Organize files by folder structure like "Controllers", "Services", "Models".`,
    parameters: [
      { name: 'groups', type: 'array', description: 'Array of groups: [{ name: "Auth Screens", files: [{ path: "/app/login/page.tsx", name: "Login" }, { path: "/app/signup/page.tsx", name: "Signup" }], color?: "#6366f1" }]', required: true },
      { name: 'layout', type: 'string', description: 'How to arrange groups: "horizontal" places groups side-by-side (default), "vertical" stacks groups top-to-bottom', required: false, enum: ['horizontal', 'vertical'] }
    ],
    returns: { type: '{ nodeIds: string[], groupHeaderIds: string[] }', description: 'All node IDs and group header IDs' }
  },
  {
    name: 'code.getLineCount',
    namespace: 'code',
    description: 'Get the number of lines in a code node. Useful for planning chunked reads of large files.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Code node ID or name', required: true }
    ],
    returns: { type: 'number | null', description: 'Line count, or null if node not found' }
  },
  {
    name: 'code.getCode',
    namespace: 'code',
    description: `Get code from a Code node. Supports optional line range for large files (like Claude Code's Read tool).

Without offset/limit: returns full code.
With offset/limit: returns specific lines (0-indexed).

Example: offset=100, limit=50 returns lines 100-149.`,
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Code node ID or name', required: true },
      { name: 'offset', type: 'number', description: 'Starting line number (0-indexed)', required: false },
      { name: 'limit', type: 'number', description: 'Number of lines to return', required: false }
    ],
    returns: { type: 'string | null', description: 'Code content (full or specified range)' }
  },
  {
    name: 'code.setCode',
    namespace: 'code',
    description: 'Update code content in a code node. If node is EServer-sourced, will sync to source file.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Code node ID', required: true },
      { name: 'code', type: 'string', description: 'Source code to set', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  {
    name: 'code.setLines',
    namespace: 'code',
    description: `Replace a range of lines in a code node. More efficient than setCode for partial updates.

The number of lines being replaced equals the length of the 'lines' array.
Lines at startLine through startLine + lines.length - 1 will be replaced.`,
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Code node ID or name', required: true },
      { name: 'startLine', type: 'number', description: 'Starting line number (0-indexed)', required: true },
      { name: 'lines', type: 'array', description: 'Array of line strings to insert/replace', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  }
]

const sheetTools: ToolDefinition[] = [
  {
    name: 'sheet.create',
    namespace: 'sheet',
    description: 'Create a new Sheet (spreadsheet) node with data.',
    parameters: [
      { name: 'name', type: 'string', description: 'Display name for the sheet', required: false },
      { name: 'data', type: 'array', description: '2D array of data', required: false },
      { name: 'headers', type: 'array', description: 'Column headers', required: false },
      { name: 'position', type: 'object', description: 'Position {x, y} on canvas', required: false }
    ],
    returns: { type: 'string', description: 'ID of the created sheet node' }
  },
  {
    name: 'sheet.setData',
    namespace: 'sheet',
    description: 'Replace all data in a Sheet.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID', required: true },
      { name: 'data', type: 'array', description: '2D array of data to set', required: true },
      { name: 'headers', type: 'array', description: 'Optional column headers', required: false }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  // ===== Metadata Operations =====
  {
    name: 'sheet.getRowCount',
    namespace: 'sheet',
    description: 'Get the number of rows in a Sheet. Use for planning pagination/chunked reads.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true }
    ],
    returns: { type: 'number | null', description: 'Row count, or null if not found' }
  },
  {
    name: 'sheet.getColumnCount',
    namespace: 'sheet',
    description: 'Get the number of columns in a Sheet.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true }
    ],
    returns: { type: 'number | null', description: 'Column count, or null if not found' }
  },
  {
    name: 'sheet.getHeaders',
    namespace: 'sheet',
    description: 'Get the column headers of a Sheet.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true }
    ],
    returns: { type: 'string[] | null', description: 'Headers array, or null if not found' }
  },
  // ===== Chunked Read Operations =====
  {
    name: 'sheet.getRows',
    namespace: 'sheet',
    description: 'Get a range of rows from a Sheet (0-indexed, inclusive). Use for large sheets instead of getData.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'startRow', type: 'number', description: 'Starting row index (0-indexed)', required: true },
      { name: 'endRow', type: 'number', description: 'Ending row index (inclusive)', required: true }
    ],
    returns: { type: 'any[][] | null', description: '2D array of row data' }
  },
  {
    name: 'sheet.getColumn',
    namespace: 'sheet',
    description: 'Get an entire column from a Sheet by index or letter.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'col', type: 'string', description: 'Column index (0-based number) or letter (e.g., "A", "B", "AA")', required: true }
    ],
    returns: { type: 'any[] | null', description: 'Array of column values' }
  },
  {
    name: 'sheet.getDataPaginated',
    namespace: 'sheet',
    description: 'Get sheet data with pagination. Best for large sheets (100K+ rows).',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'page', type: 'number', description: 'Page number (0-indexed)', required: true },
      { name: 'pageSize', type: 'number', description: 'Rows per page (recommended: 100-1000)', required: true }
    ],
    returns: {
      type: '{ data, page, pageSize, totalRows, totalPages, hasMore }',
      description: 'Paginated data with metadata'
    }
  },
  // ===== Cell Operations =====
  {
    name: 'sheet.getCell',
    namespace: 'sheet',
    description: 'Get a single cell value from a Sheet.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'row', type: 'number', description: 'Row index (0-indexed)', required: true },
      { name: 'col', type: 'number', description: 'Column index (0-indexed)', required: true }
    ],
    returns: { type: 'any', description: 'Cell value' }
  },
  {
    name: 'sheet.setCell',
    namespace: 'sheet',
    description: 'Set a single cell value in a Sheet. Can also set formulas (start with =).',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'row', type: 'number', description: 'Row index (0-indexed)', required: true },
      { name: 'col', type: 'number', description: 'Column index (0-indexed)', required: true },
      { name: 'value', type: 'any', description: 'Value to set (or formula starting with =)', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  {
    name: 'sheet.getCellInfo',
    namespace: 'sheet',
    description: 'Get detailed cell info including formula and computed value.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'row', type: 'number', description: 'Row index (0-indexed)', required: true },
      { name: 'col', type: 'number', description: 'Column index (0-indexed)', required: true }
    ],
    returns: { type: '{ raw, computed, formula?, error? } | null', description: 'Cell info with raw/computed values' }
  },
  // ===== Row CRUD Operations =====
  {
    name: 'sheet.insertRow',
    namespace: 'sheet',
    description: 'Insert a row at a specific position.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'rowIndex', type: 'number', description: 'Position to insert (0-indexed)', required: true },
      { name: 'data', type: 'array', description: 'Row data as array', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  {
    name: 'sheet.deleteRow',
    namespace: 'sheet',
    description: 'Delete a row at a specific position.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'rowIndex', type: 'number', description: 'Row to delete (0-indexed)', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  {
    name: 'sheet.updateRow',
    namespace: 'sheet',
    description: 'Replace an entire row at a specific position.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'rowIndex', type: 'number', description: 'Row to update (0-indexed)', required: true },
      { name: 'data', type: 'array', description: 'New row data', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  // ===== Column CRUD Operations =====
  {
    name: 'sheet.insertColumn',
    namespace: 'sheet',
    description: 'Insert a column at a specific position.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'colIndex', type: 'number', description: 'Position to insert (0-indexed)', required: true },
      { name: 'data', type: 'array', description: 'Column data (one value per row)', required: true },
      { name: 'header', type: 'string', description: 'Optional column header', required: false }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  {
    name: 'sheet.deleteColumn',
    namespace: 'sheet',
    description: 'Delete a column at a specific position.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'colIndex', type: 'number', description: 'Column to delete (0-indexed)', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  // ===== Batch Operations (for AI workflows) =====
  {
    name: 'sheet.setCells',
    namespace: 'sheet',
    description: 'Set multiple cells in one call - efficient for sparse updates. Values starting with "=" are treated as formulas.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      {
        name: 'cells',
        type: 'array',
        description: 'Array of cell updates: [{ row: 0, col: 2, value: "text" }, { row: 5, col: 2, value: "=A6*B6" }]',
        required: true,
        items: { type: 'object' }
      }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  {
    name: 'sheet.fillRange',
    namespace: 'sheet',
    description: 'Fill a range with a formula pattern - efficient for computed columns/rows. Use {row} for 1-indexed row number (Excel-style), {col} for column letter.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'formula', type: 'string', description: 'Formula pattern with {row}/{col} placeholders (e.g., "=A{row}*B{row}")', required: true },
      { name: 'col', type: 'number', description: 'Column index for vertical fill (0-indexed)', required: false },
      { name: 'startRow', type: 'number', description: 'Start row (0-indexed, defaults to 0)', required: false },
      { name: 'endRow', type: 'number', description: 'End row (0-indexed, defaults to last row)', required: false },
      { name: 'row', type: 'number', description: 'Row index for horizontal fill (0-indexed)', required: false },
      { name: 'startCol', type: 'number', description: 'Start column for horizontal fill (0-indexed)', required: false },
      { name: 'endCol', type: 'number', description: 'End column for horizontal fill (0-indexed)', required: false }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  // ===== Formula Operations =====
  {
    name: 'sheet.setCellFormula',
    namespace: 'sheet',
    description: 'Set a formula for a cell. Formulas must start with =.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'row', type: 'number', description: 'Row index (0-indexed)', required: true },
      { name: 'col', type: 'number', description: 'Column index (0-indexed)', required: true },
      { name: 'formula', type: 'string', description: 'Formula string (e.g., "=SUM(A1:A10)")', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  {
    name: 'sheet.getCellFormula',
    namespace: 'sheet',
    description: 'Get the formula string for a cell.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true },
      { name: 'row', type: 'number', description: 'Row index (0-indexed)', required: true },
      { name: 'col', type: 'number', description: 'Column index (0-indexed)', required: true }
    ],
    returns: { type: 'string | null', description: 'Formula string or null if no formula' }
  },
  {
    name: 'sheet.getFormulas',
    namespace: 'sheet',
    description: 'Get all formulas in a Sheet as a map of cell keys to formula strings.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Sheet node ID or name', required: true }
    ],
    returns: { type: 'Record<string, string> | null', description: 'Map of cellKey to formula (e.g., {"A1": "=SUM(B1:B5)"})' }
  },
  {
    name: 'sheet.listFunctions',
    namespace: 'sheet',
    description: `List all available formula functions. Sheets support ALL standard Excel/Google Sheets functions including:
- Math: SUM, AVERAGE, MIN, MAX, ROUND, ABS, SQRT, etc.
- Lookup: VLOOKUP, HLOOKUP, INDEX, MATCH, LOOKUP
- Text: CONCAT, LEFT, RIGHT, MID, LEN, TRIM, UPPER, LOWER
- Logic: IF, AND, OR, NOT, IFERROR, SWITCH
- Date: TODAY, NOW, DATE, YEAR, MONTH, DAY
- Stats: COUNT, COUNTA, COUNTIF, SUMIF, AVERAGEIF
And 50+ more functions.`,
    parameters: [],
    returns: { type: 'string[]', description: 'Array of available function names' }
  }
]

// ============================================================================
// Text Node Tools (markdown/documentation nodes with LaTeX support)
// ============================================================================

const textTools: ToolDefinition[] = [
  {
    name: 'text.create',
    namespace: 'text',
    description: `Create a Text (documentation) node with markdown and LaTeX support.

Text nodes are ideal for:
- Documentation and explanations
- Mathematical formulas using LaTeX ($...$ for inline, $$...$$ for block)
- Rich text content with headers, lists, code blocks
- Plans, discussions, and progress tracking in CodeBook view

In CodeBook: Use codebook.addCell('text') instead for proper cell insertion.`,
    parameters: [
      { name: 'name', type: 'string', description: 'Display name for the node', required: false },
      { name: 'content', type: 'string', description: 'Markdown content. Use $...$ for inline math, $$...$$ for block math', required: false },
      { name: 'position', type: 'object', description: 'Position {x, y} on canvas', required: false }
    ],
    returns: { type: 'string', description: 'ID of created text node' }
  },
  {
    name: 'text.getContent',
    namespace: 'text',
    description: 'Get markdown content from a Text node.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Text node ID or name', required: true }
    ],
    returns: { type: 'string | null', description: 'Markdown content or null if not found' }
  },
  {
    name: 'text.setContent',
    namespace: 'text',
    description: 'Update markdown content in a Text node. Supports markdown and LaTeX.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Text node ID', required: true },
      { name: 'content', type: 'string', description: 'Markdown content to set', required: true }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  }
]

// ============================================================================
// CodeBook Tools (Jupyter/Colab-style notebook view)
// ============================================================================

const codebookTools: ToolDefinition[] = [
  {
    name: 'codebook.isOpen',
    namespace: 'codebook',
    description: 'Check if CodeBook (notebook view) is currently active. When CodeBook is open, node creation should use codebook.addCell for proper cell insertion.',
    parameters: [],
    returns: { type: 'boolean', description: 'True if CodeBook overlay is open' }
  },
  {
    name: 'codebook.getState',
    namespace: 'codebook',
    description: 'Get CodeBook state including cell order, selected cell, and execution status. Useful for understanding the current notebook context.',
    parameters: [],
    returns: {
      type: '{ isOpen, cellOrder, selectedCellId, isExecuting } | null',
      description: 'CodeBook state or null if not available'
    }
  },
  {
    name: 'codebook.addCell',
    namespace: 'codebook',
    description: `Add a new cell to CodeBook. Creates a linked node in the workflow and inserts it in the cell order.

Supported cell types:
- **code**: Python/JavaScript code with execution
- **text**: Markdown documentation with LaTeX support ($...$)
- **agent**: AI-powered processing cell
- **datagrid**: Spreadsheet/sheet for data
- **chart**: Visualization cell
- **image**: Image display cell

This is the preferred way to add nodes when CodeBook is open. For workflow canvas, use code.create, text.create, or sheet.create instead.`,
    parameters: [
      { name: 'nodeType', type: 'string', description: 'Type of cell: code, text, agent, datagrid, chart, image', required: true, enum: ['code', 'text', 'agent', 'datagrid', 'chart', 'image'] },
      { name: 'afterCellId', type: 'string', description: 'Insert after this cell ID (optional, defaults to end)', required: false },
      { name: 'executionTarget', type: 'string', description: 'For code cells: pyodide, this-computer, or eserver:<id>', required: false }
    ],
    returns: { type: 'string | null', description: 'ID of created cell, or null if CodeBook is not open' }
  },
  {
    name: 'codebook.open',
    namespace: 'codebook',
    description: 'Open CodeBook view for the current workflow. Switches to notebook-style linear view.',
    parameters: [],
    returns: { type: 'void', description: 'Opens CodeBook overlay' }
  },
  {
    name: 'codebook.close',
    namespace: 'codebook',
    description: 'Close CodeBook view and return to workflow canvas.',
    parameters: [],
    returns: { type: 'void', description: 'Closes CodeBook overlay' }
  },
  {
    name: 'codebook.runCell',
    namespace: 'codebook',
    description: 'Execute a specific cell in CodeBook.',
    parameters: [
      { name: 'cellId', type: 'string', description: 'ID of the cell to execute', required: true }
    ],
    returns: { type: 'void', description: 'Triggers cell execution' }
  },
  {
    name: 'codebook.runAll',
    namespace: 'codebook',
    description: 'Execute all cells in CodeBook in order.',
    parameters: [],
    returns: { type: 'void', description: 'Triggers execution of all cells' }
  },
  {
    name: 'codebook.getExecutionTarget',
    namespace: 'codebook',
    description: 'Get the current Python execution target for new code cells.',
    parameters: [],
    returns: { type: 'string', description: 'Execution target: pyodide, this-computer, or eserver:<id>' }
  },
  {
    name: 'codebook.setExecutionTarget',
    namespace: 'codebook',
    description: 'Set the Python execution target for new code cells.',
    parameters: [
      { name: 'target', type: 'string', description: 'Execution target: pyodide, this-computer, or eserver:<id>', required: true }
    ],
    returns: { type: 'void', description: 'Updates execution target' }
  }
]

// ============================================================================
// Agent Delegation Tools (complex tasks go to Circuitry's chat agent)
// ============================================================================

const agentTools: ToolDefinition[] = [
  {
    name: 'agent.chat',
    namespace: 'agent',
    description: 'Send a message to Circuitry\'s chat agent. Opens chat panel in agent+mcp mode. Agent creates flowcharts, handles complex visual tasks. Returns a chatId for polling.',
    parameters: [
      { name: 'message', type: 'string', description: 'Message to send to the agent', required: true },
      { name: 'context', type: 'object', description: 'Optional context (selected nodes, etc)', required: false }
    ],
    returns: { type: '{ chatId, status }', description: 'Chat ID for polling and initial status' }
  },
  // {
  //   name: 'agent.createFlowchart',
  //   namespace: 'agent',
  //   description: 'Ask agent to create flowchart from natural language. Use nodes.createFlowchart for direct control.',
  //   parameters: [
  //     { name: 'description', type: 'string', description: 'Natural language description of the flowchart to create', required: true },
  //     { name: 'style', type: 'string', description: 'Style preference', required: false, enum: ['simple', 'detailed', 'technical'] }
  //   ],
  //   returns: { type: '{ chatId, status }', description: 'Chat ID for polling' }
  // },
  {
    name: 'agent.poll',
    namespace: 'agent',
    description: 'Poll for agent response. Call this after agent.chat.',
    parameters: [
      { name: 'chatId', type: 'string', description: 'Chat ID from agent.chat', required: true }
    ],
    returns: {
      type: '{ status, response?, createdNodes?, error? }',
      description: 'Status: pending, completed, error. Response included when completed.'
    }
  }
]

// ============================================================================
// Drawing Layer Tools (for sketch interpretation)
// ============================================================================

const drawingTools: ToolDefinition[] = [
  {
    name: 'drawing.getImage',
    namespace: 'drawing',
    description: 'Get the drawing layer as an image for visual interpretation. Use this when user sketches an idea and you need to "see" what they drew. Returns base64 PNG.',
    parameters: [
      { name: 'maxSize', type: 'number', description: 'Max dimension in pixels (default: 1024)', required: false },
      { name: 'backgroundColor', type: 'string', description: 'Background color (default: transparent)', required: false }
    ],
    returns: {
      type: '{ imageData: string, width: number, height: number, strokeCount: number }',
      description: 'Base64 PNG image data and dimensions'
    }
  },
  {
    name: 'drawing.getActiveDocument',
    namespace: 'drawing',
    description: 'Get information about the active drawing document. Use to determine context (notepad/designer/workflow) and whether HTML components exist.',
    parameters: [],
    returns: {
      type: '{ type: "notepad" | "designer" | "workflow", documentId: string | null, name: string | null, hasHtmlComponents: boolean, htmlComponentCount: number } | null',
      description: 'Active document info or null if no drawing layer is active'
    }
  }
]

// ============================================================================
// HTML Component Tools (for drawing layer HTML integration)
// ============================================================================

const htmlTools: ToolDefinition[] = [
  {
    name: 'html.create',
    namespace: 'html',
    description: `Create HTML content in Circuitry. In WORKFLOW context, there are TWO options - ASK THE USER which they prefer (first time or when unclear):

**target: "drawing"** (Drawing Layer) - Default
- Quick visual prototypes, annotations, mockups
- Renders on the canvas drawing layer
- Use HTML Pointer tool to interact with form elements
- Good for: rapid iteration, mixing with drawings/strokes

**target: "node"** (Web Node) - Creates a workflow node
- Data-driven content with inputs from other nodes
- Has AI wizard for iterative refinement
- Can execute JavaScript on workflow run
- Good for: dynamic content, workflow integration

In DESIGNER or NOTEPAD context: Only drawing layer is available (ignore target parameter).

**DESIGNER MODE:** Use screenId to specify which screen/artboard to add the component to. If not specified, uses the currently selected screen. Position is relative to the screen's top-left corner (0,0).

Position is auto-calculated if not provided (avoids overlapping existing elements).

**MOBILE UI SIZING GUIDELINES:**
- Status bar: 44px height (iOS standard)
- Headers/nav bars: **64px height** (not 56px - allows proper padding)
- Bottom nav: 84px height (includes safe area)
- Use CSS: \`box-sizing: border-box; height: 100%;\` to fill container properly
- Use \`line-height: 1;\` on text to prevent extra spacing
- Use \`padding: 0;\` on buttons to prevent unexpected sizing
- iPhone 15: 393x852 total screen size

**COLOR CONTRAST:** Ensure sufficient contrast between text and background.
- **AVOID**: light text on light backgrounds, dark text on dark backgrounds
- Gradient backgrounds: text must contrast with ALL parts of the gradient
- When unsure, test readability - if hard to read, increase contrast`,
    parameters: [
      { name: 'name', type: 'string', description: 'Display name (e.g., "Login Form", "Nav Menu")', required: true },
      { name: 'html', type: 'string', description: 'Full HTML structure', required: true },
      { name: 'css', type: 'string', description: 'Scoped CSS for the component', required: true },
      { name: 'js', type: 'string', description: 'Optional JavaScript for interactivity', required: false },
      { name: 'target', type: 'string', description: 'Where to create: "drawing" (canvas layer, default) or "node" (Web Node). In workflow, ASK USER if not specified.', required: false },
      { name: 'screenId', type: 'string', description: 'Target screen ID or name (Designer mode only). If not specified, uses selected screen.', required: false },
      { name: 'container', type: 'string', description: 'Semantic container type (Designer mode): "header" (top), "footer" (bottom), "content" (main area), "nav" (navigation). Auto-positions based on type and groups for preview structure.', required: false, enum: ['header', 'footer', 'content', 'nav'] },
      { name: 'position', type: 'object', description: 'Position { x, y } relative to screen/canvas. If container is set, auto-calculated based on semantic meaning.', required: false },
      { name: 'dimensions', type: 'object', description: 'Size { width, height } in pixels (default: 320x200)', required: false },
      { name: 'isolated', type: 'boolean', description: 'CSS isolation: true = Shadow DOM (default), false = inherits global CSS', required: false },
      { name: 'href', type: 'string', description: 'Link URL or screen target. Use "#screen:ScreenName" for navigation between screens in preview (e.g., "#screen:Home", "#screen:Dashboard"). External URLs also supported.', required: false }
    ],
    returns: { type: 'string', description: 'Component ID or Node ID' }
  },
  {
    name: 'html.update',
    namespace: 'html',
    description: 'Update an existing HTML component. Only provided fields will be updated. **In Designer mode, operates on currently selected screen** - use screen.select first if needed.',
    parameters: [
      { name: 'id', type: 'string', description: 'Component ID', required: true },
      { name: 'name', type: 'string', description: 'New display name', required: false },
      { name: 'html', type: 'string', description: 'New HTML structure', required: false },
      { name: 'css', type: 'string', description: 'New CSS styles', required: false },
      { name: 'js', type: 'string', description: 'New JavaScript', required: false },
      { name: 'position', type: 'object', description: 'New position { x, y }', required: false },
      { name: 'dimensions', type: 'object', description: 'New size { width, height }', required: false },
      { name: 'rotation', type: 'number', description: 'Rotation in degrees', required: false },
      { name: 'zIndex', type: 'number', description: 'Z-index for layering', required: false },
      { name: 'locked', type: 'boolean', description: 'Lock from editing', required: false },
      { name: 'href', type: 'string', description: 'Link URL or screen target. Use "#screen:ScreenName" for navigation between screens. Set to empty string to remove link.', required: false }
    ],
    returns: { type: 'boolean', description: 'True if successful' }
  },
  {
    name: 'html.delete',
    namespace: 'html',
    description: 'Delete an HTML component from the drawing layer. **In Designer mode, operates on currently selected screen.**',
    parameters: [
      { name: 'id', type: 'string', description: 'Component ID', required: true }
    ],
    returns: { type: 'boolean', description: 'True if deleted' }
  },
  {
    name: 'html.list',
    namespace: 'html',
    description: 'List all HTML components in the current drawing layer. **In Designer mode, lists components on currently selected screen.**',
    parameters: [],
    returns: {
      type: 'Array<{ id, name, position, dimensions, isolated }>',
      description: 'Array of component summaries'
    }
  },
  {
    name: 'html.get',
    namespace: 'html',
    description: 'Get full details of an HTML component including HTML, CSS, and JS content. **In Designer mode, searches currently selected screen** - use screen.select first if needed.',
    parameters: [
      { name: 'id', type: 'string', description: 'Component ID', required: true }
    ],
    returns: {
      type: 'HtmlComponentInfo | null',
      description: 'Full component details: { id, name, html, css, js, position, dimensions, rotation, isolated, zIndex, locked }'
    }
  },
  {
    name: 'html.getByName',
    namespace: 'html',
    description: 'Get an HTML component by its display name. Case-insensitive search. Use this to find components like "Login Form" or "Navigation Menu" without needing to know the ID. **In Designer mode, searches currently selected screen.**',
    parameters: [
      { name: 'name', type: 'string', description: 'Component display name (e.g., "Login Form")', required: true }
    ],
    returns: {
      type: 'HtmlComponentInfo | null',
      description: 'Full component details or null if not found'
    }
  }
]

// ============================================================================
// Designer Tools (Designer mode page/layout CRUD)
// ============================================================================

const designerTools: ToolDefinition[] = [
  {
    name: 'designer.getActive',
    namespace: 'designer',
    description: `Check if Designer mode is active and get current document info.

Returns null if not in Designer mode. Use this before calling screen.* or layout.* tools.`,
    parameters: [],
    returns: {
      type: '{ isDesigner: boolean, documentId: string, name: string, screenCount: number, selectedScreenId?: string } | null',
      description: 'Designer document info or null if not in Designer'
    }
  },
  {
    name: 'designer.getMode',
    namespace: 'designer',
    description: 'Get the current Designer mode (design, layout, html, or preview).',
    parameters: [],
    returns: {
      type: '"design" | "layout" | "html" | "preview" | null',
      description: 'Current mode or null if not in Designer'
    }
  },
  {
    name: 'designer.setMode',
    namespace: 'designer',
    description: `Set the Designer mode.

- **design**: Freehand drawing, sketching UI mockups
- **layout**: Add structural containers (grids, sections)
- **html**: Convert drawings to HTML, edit properties
- **preview**: Interactive preview, test responsiveness`,
    parameters: [
      { name: 'mode', type: 'string', description: 'Mode to set: design, layout, html, or preview', required: true, enum: ['design', 'layout', 'html', 'preview'] }
    ],
    returns: { type: 'boolean', description: 'True if mode was set successfully' }
  }
]

// ============================================================================
// Screen Tools (Designer artboards/pages)
// ============================================================================

const screenTools: ToolDefinition[] = [
  {
    name: 'screen.list',
    namespace: 'screen',
    description: 'List all screens (pages/artboards) in the current Designer document.',
    parameters: [],
    returns: {
      type: 'Array<{ id, name, position, dimensions, backgroundColor, devicePreset, order }>',
      description: 'Array of screen summaries'
    }
  },
  {
    name: 'screen.get',
    namespace: 'screen',
    description: 'Get a screen by ID or name.',
    parameters: [
      { name: 'screenId', type: 'string', description: 'Screen ID or name', required: true }
    ],
    returns: {
      type: 'ScreenInfo | null',
      description: 'Full screen details including layouts and HTML components'
    }
  },
  {
    name: 'screen.create',
    namespace: 'screen',
    description: `Create a new screen (page/artboard) in the Designer.

Device presets: iPhone 15, iPhone SE, iPad Pro 12", Desktop 1920, etc.
Or use "custom" with explicit dimensions.`,
    parameters: [
      { name: 'name', type: 'string', description: 'Screen name (e.g., "Home", "Login", "Dashboard")', required: true },
      { name: 'devicePreset', type: 'string', description: 'Device preset or "custom"', required: false },
      { name: 'dimensions', type: 'object', description: 'Custom dimensions { width, height } - used when devicePreset is "custom"', required: false },
      { name: 'backgroundColor', type: 'string', description: 'Background color (default: #ffffff)', required: false },
      { name: 'position', type: 'object', description: 'Position { x, y } on canvas (auto-calculated if not provided)', required: false }
    ],
    returns: { type: 'string', description: 'ID of created screen' }
  },
  {
    name: 'screen.update',
    namespace: 'screen',
    description: 'Update screen properties (name, dimensions, backgroundColor).',
    parameters: [
      { name: 'screenId', type: 'string', description: 'Screen ID or name', required: true },
      { name: 'name', type: 'string', description: 'New name', required: false },
      { name: 'dimensions', type: 'object', description: 'New dimensions { width, height }', required: false },
      { name: 'backgroundColor', type: 'string', description: 'New background color', required: false }
    ],
    returns: { type: 'boolean', description: 'True if updated successfully' }
  },
  {
    name: 'screen.delete',
    namespace: 'screen',
    description: 'Delete a screen from the Designer.',
    parameters: [
      { name: 'screenId', type: 'string', description: 'Screen ID or name', required: true }
    ],
    returns: { type: 'boolean', description: 'True if deleted' }
  },
  {
    name: 'screen.duplicate',
    namespace: 'screen',
    description: 'Duplicate a screen with all its layouts and HTML components.',
    parameters: [
      { name: 'screenId', type: 'string', description: 'Screen ID or name to duplicate', required: true },
      { name: 'newName', type: 'string', description: 'Name for the duplicated screen', required: false }
    ],
    returns: { type: 'string', description: 'ID of the duplicated screen' }
  },
  {
    name: 'screen.select',
    namespace: 'screen',
    description: 'Select a screen to make it active for editing.',
    parameters: [
      { name: 'screenId', type: 'string', description: 'Screen ID or name', required: true }
    ],
    returns: { type: 'boolean', description: 'True if screen was selected' }
  },
  {
    name: 'screen.capture',
    namespace: 'screen',
    description: `Capture a Designer screen as a PNG image. Use this to verify layouts and catch visual issues like:
- Clipped content (text/buttons cut off by container)
- Poor contrast (light text on light background)
- Overlapping elements
- Sizing problems

Returns the screen as a base64 PNG image that Claude can analyze visually.`,
    parameters: [
      { name: 'screenId', type: 'string', description: 'Screen ID or name (optional - uses selected screen if not specified)', required: false }
    ],
    returns: {
      type: '{ imageData: string, width: number, height: number, screenId: string, screenName: string }',
      description: 'Base64 PNG image data and screen dimensions'
    }
  }
]

// ============================================================================
// Layout Tools (Designer layout elements - grids, sections, containers)
// ============================================================================

const layoutTools: ToolDefinition[] = [
  {
    name: 'layout.list',
    namespace: 'layout',
    description: 'List all layout elements on the current or specified screen.',
    parameters: [
      { name: 'screenId', type: 'string', description: 'Screen ID or name (optional - uses current screen if not provided)', required: false }
    ],
    returns: {
      type: 'Array<{ id, name, type, position, dimensions, style }>',
      description: 'Array of layout element summaries'
    }
  },
  {
    name: 'layout.get',
    namespace: 'layout',
    description: 'Get a layout element by ID or name.',
    parameters: [
      { name: 'layoutId', type: 'string', description: 'Layout ID or name', required: true }
    ],
    returns: {
      type: 'LayoutElementInfo | null',
      description: 'Full layout details including cells (for grids) and style'
    }
  },
  {
    name: 'layout.create',
    namespace: 'layout',
    description: `Create a layout element on a screen.

**Layout Types:**
- Semantic sections: header, footer, hero, sidebar
- Grid layouts: grid-1col, grid-2col, grid-3col, grid-4col
- Flex layouts: flex-row, flex-column
- Containers: card, container

Full-width types (header, footer, hero, grids, container) auto-snap to screen width.
Semantic elements auto-position: header at top, footer at bottom.`,
    parameters: [
      { name: 'type', type: 'string', description: 'Layout type', required: true, enum: ['header', 'footer', 'hero', 'sidebar', 'grid-1col', 'grid-2col', 'grid-3col', 'grid-4col', 'flex-row', 'flex-column', 'card', 'container'] },
      { name: 'name', type: 'string', description: 'Display name (optional - defaults to type name)', required: false },
      { name: 'screenId', type: 'string', description: 'Screen ID or name (optional - uses current screen)', required: false },
      { name: 'position', type: 'object', description: 'Position { x, y } (auto-calculated for semantic elements)', required: false },
      { name: 'dimensions', type: 'object', description: 'Size { width, height } (uses defaults if not provided)', required: false },
      { name: 'style', type: 'object', description: 'Style overrides { backgroundColor, padding, gap, borderRadius, etc. }', required: false }
    ],
    returns: { type: 'string', description: 'ID of created layout element' }
  },
  {
    name: 'layout.update',
    namespace: 'layout',
    description: 'Update a layout element (name, position, dimensions, style).',
    parameters: [
      { name: 'layoutId', type: 'string', description: 'Layout ID or name', required: true },
      { name: 'name', type: 'string', description: 'New name', required: false },
      { name: 'position', type: 'object', description: 'New position { x, y }', required: false },
      { name: 'dimensions', type: 'object', description: 'New dimensions { width, height }', required: false }
    ],
    returns: { type: 'boolean', description: 'True if updated' }
  },
  {
    name: 'layout.delete',
    namespace: 'layout',
    description: 'Delete a layout element.',
    parameters: [
      { name: 'layoutId', type: 'string', description: 'Layout ID or name', required: true }
    ],
    returns: { type: 'boolean', description: 'True if deleted' }
  },
  {
    name: 'layout.setStyle',
    namespace: 'layout',
    description: `Set style properties on a layout element.

**Available style properties:**
- backgroundColor, borderColor, borderWidth, borderRadius, opacity
- padding: { top, right, bottom, left }
- gap (spacing between children)
- justifyContent, alignItems (for flex/grid alignment)
- widthMode, heightMode ('fixed' or 'flexible')
- widthPercent, heightPercent (for responsive sizing)`,
    parameters: [
      { name: 'layoutId', type: 'string', description: 'Layout ID or name', required: true },
      { name: 'style', type: 'object', description: 'Style properties to set', required: true }
    ],
    returns: { type: 'boolean', description: 'True if style was set' }
  },
  {
    name: 'layout.search',
    namespace: 'layout',
    description: 'Search for layout elements by name or type.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search term (matches name)', required: false },
      { name: 'type', type: 'string', description: 'Filter by layout type', required: false, enum: ['header', 'footer', 'hero', 'sidebar', 'grid-1col', 'grid-2col', 'grid-3col', 'grid-4col', 'flex-row', 'flex-column', 'card', 'container'] },
      { name: 'screenId', type: 'string', description: 'Filter by screen', required: false }
    ],
    returns: {
      type: 'Array<{ id, name, type, screenId, confidence }>',
      description: 'Matching layouts with confidence scores'
    }
  },
  {
    name: 'layout.getCell',
    namespace: 'layout',
    description: 'Get details about a specific cell in a grid layout.',
    parameters: [
      { name: 'layoutId', type: 'string', description: 'Grid layout ID or name', required: true },
      { name: 'cellIndex', type: 'number', description: 'Cell index (0-based)', required: true }
    ],
    returns: {
      type: '{ id, index, contentMode, style, htmlContent? } | null',
      description: 'Cell details or null if not found'
    }
  },
  {
    name: 'layout.setCellStyle',
    namespace: 'layout',
    description: 'Set style properties on a specific grid cell.',
    parameters: [
      { name: 'layoutId', type: 'string', description: 'Grid layout ID or name', required: true },
      { name: 'cellIndex', type: 'number', description: 'Cell index (0-based)', required: true },
      { name: 'style', type: 'object', description: 'Style properties { backgroundColor, justifyContent, alignItems, etc. }', required: true }
    ],
    returns: { type: 'boolean', description: 'True if style was set' }
  },
  {
    name: 'layout.setCellContent',
    namespace: 'layout',
    description: 'Set HTML content for a grid cell. Use html.create for more complex components.',
    parameters: [
      { name: 'layoutId', type: 'string', description: 'Grid layout ID or name', required: true },
      { name: 'cellIndex', type: 'number', description: 'Cell index (0-based)', required: true },
      { name: 'html', type: 'string', description: 'HTML content for the cell', required: true },
      { name: 'css', type: 'string', description: 'Optional CSS for the content', required: false }
    ],
    returns: { type: 'boolean', description: 'True if content was set' }
  }
]

// ============================================================================
// All Tool Definitions
// ============================================================================

export const allToolDefinitions: ToolDefinition[] = [
  ...connectionTools,
  ...workflowTools,
  ...nodeTools,
  ...edgeTools,
  ...codeTools,
  ...sheetTools,
  ...textTools,
  ...codebookTools,
  ...agentTools,
  ...drawingTools,
  ...htmlTools,
  ...designerTools,
  ...screenTools,
  ...layoutTools
]

// ============================================================================
// Zod Schema Generation
// ============================================================================

/**
 * Convert a tool parameter type to Zod schema
 */
function paramTypeToZod(param: ToolDefinition['parameters'][0]): z.ZodTypeAny {
  let schema: z.ZodTypeAny

  switch (param.type) {
    case 'string':
      schema = param.enum ? z.enum(param.enum as [string, ...string[]]) : z.string()
      break
    case 'number':
      schema = z.number()
      break
    case 'boolean':
      schema = z.boolean()
      break
    case 'array':
      schema = z.array(z.any())
      break
    case 'object':
      schema = z.record(z.any())
      break
    default:
      schema = z.any()
  }

  if (!param.required) {
    schema = schema.optional()
  }

  return schema.describe(param.description)
}

/**
 * Build a Zod schema for a tool's parameters
 */
export function buildToolSchema(tool: ToolDefinition): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const param of tool.parameters) {
    shape[param.name] = paramTypeToZod(param)
  }

  return z.object(shape)
}

/**
 * Get all tools with their Zod schemas
 */
export function getToolsWithSchemas(): Array<{
  name: string
  description: string
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>
}> {
  return allToolDefinitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    schema: buildToolSchema(tool)
  }))
}

/**
 * Get tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return allToolDefinitions.find(t => t.name === name)
}

/**
 * Get tools grouped by namespace
 */
export function getToolsByNamespace(): Record<string, ToolDefinition[]> {
  const grouped: Record<string, ToolDefinition[]> = {}
  for (const tool of allToolDefinitions) {
    if (!grouped[tool.namespace]) {
      grouped[tool.namespace] = []
    }
    grouped[tool.namespace].push(tool)
  }
  return grouped
}
