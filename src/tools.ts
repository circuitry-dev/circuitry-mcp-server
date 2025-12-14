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
    name: 'code.setCode',
    namespace: 'code',
    description: 'Update code content in a code node. If node is EServer-sourced, will sync to source file.',
    parameters: [
      { name: 'nodeId', type: 'string', description: 'Code node ID', required: true },
      { name: 'code', type: 'string', description: 'Source code to set', required: true }
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
  {
    name: 'agent.createFlowchart',
    namespace: 'agent',
    description: 'Ask agent to create a flowchart. Agent is fine-tuned for this. Returns chatId for polling.',
    parameters: [
      { name: 'description', type: 'string', description: 'Description of the flowchart to create', required: true },
      { name: 'style', type: 'string', description: 'Style preference', required: false, enum: ['simple', 'detailed', 'technical'] }
    ],
    returns: { type: '{ chatId, status }', description: 'Chat ID for polling' }
  },
  {
    name: 'agent.poll',
    namespace: 'agent',
    description: 'Poll for agent response. Call this after agent.chat or agent.createFlowchart.',
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
// All Tool Definitions
// ============================================================================

export const allToolDefinitions: ToolDefinition[] = [
  ...connectionTools,
  ...workflowTools,
  ...nodeTools,
  ...codeTools,
  ...sheetTools,
  ...agentTools
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
