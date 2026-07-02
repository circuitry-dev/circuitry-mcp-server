/**
 * Circuitry MCP Server — connection tools, schema helpers, procedure guide.
 *
 * ============================================================================
 * DYNAMIC TOOL DISCOVERY — no hand-mirrored catalog here anymore
 * ============================================================================
 *
 * The workflow/node/edge/... tool catalog is NOT defined in this file. It is
 * fetched live from the connected Circuitry app at connect time via
 * `tools.getDefinitions` (see ./tool-catalog.ts), with a bundled snapshot
 * (tools-snapshot.json, regenerated at publish by the app's
 * scripts/generate-mcp-tools.ts) as an offline/first-run fallback. Adding a
 * tool to the app therefore needs NO release of this package.
 *
 * This module keeps only what is INTRINSIC to the server:
 *   - `connectionTools` — the circuitry.* connect/disconnect/status tools that
 *     exist solely for the MCP transport (never part of the app catalog).
 *   - `PROCEDURE_AUTHORING_GUIDE` — returned inline by procedure.getAuthoringGuide
 *     so it works even when Circuitry isn't connected.
 *   - Zod schema helpers that operate on the ACTIVE tool list (getActiveTools()).
 * ============================================================================
 */

import { z } from 'zod'
import type { ToolDefinition } from './types.js'
import { getActiveTools } from './tool-catalog.js'

// ============================================================================
// Connection & Status Tools (MCP-transport-only — never in the app catalog)
// ============================================================================

export const connectionTools: ToolDefinition[] = [
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
// Procedure authoring guide — returned inline by procedure.getAuthoringGuide
// so it works even when Circuitry isn't connected.
// Keep in sync with circuitry-api's PROCEDURE_AUTHORING_GUIDE export and
// docs/procedures.md.
// ============================================================================

export const PROCEDURE_AUTHORING_GUIDE: Record<string, string> = {
  overview: `# Circuitry Procedures — quick recipe

A **Procedure** is a named sub-flow on the same canvas as the main flow.
Agents auto-discover it as a tool called \`proc_<name>\`. Code nodes can call
it via \`runSubFlow(name, input)\`. No wiring, no registration — placing a
named Start node in a disconnected subgraph is all that's required.

## Author one — exact recipe

Use these circuitryAPI calls (equivalent MCP calls exist in the
circuitry-mcp-server under the same names):

\`\`\`js
// 1. Add a Start node. This IS the procedure's entry point.
const startId = await circuitryAPI.nodes.add({ type: 'start', x: 900, y: 500 })

// 2. Name it and configure it as a Procedure. The displayName becomes the
//    tool name the agent sees (\`proc_lookup_order\`). active:false keeps it
//    from being picked as the top-level workflow entry point.
await circuitryAPI.nodes.update(startId, {
  displayName: 'lookup_order',     // becomes \`proc_lookup_order\`
  active: false,
  config: {
    description: 'Look up an order by its ID. Use when the user mentions an order number.',
    paramsSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'The order identifier' }
      },
      required: ['orderId']
    }
  }
})

// 3. Build the body. Any Circuitry nodes work — Code, HTTP, Sheet, Chart,
//    nested Agent, even another Procedure call. The Start node forwards its
//    caller's args as input to the first downstream node.
const codeId = await circuitryAPI.nodes.add({ type: 'code', x: 1200, y: 500 })
await circuitryAPI.nodes.update(codeId, {
  displayName: 'Fetch',
  config: {
    code: \`const res = await fetch('https://api.example.com/orders/' + input.orderId)
return res.json()\`,
    language: 'javascript',
    sandboxLevel: 'full'
  }
})
circuitryAPI.edges.connect(startId, codeId)

// 4. (Optional) Add a Response node at the end. If present, its value is
//    what the procedure returns. If absent, the procedure returns the output
//    of the last tail node.
\`\`\`

That's it. The next time any Agent in this workflow runs a turn, it will see
\`proc_lookup_order\` in its tool catalog, with the description and schema
you supplied.

## Three things that matter for tool-call reliability

1. **displayName must be set** and must NOT be \`"Start"\`. Without a custom
   name the Start node stays a plain entry point and isn't exposed.
2. **paramsSchema should be specific** — typed fields with descriptions.
   A permissive / empty schema makes the LLM pass \`{}\` and your procedure
   receives no useful input.
3. **description describes WHEN to call**, not HOW it's implemented. The
   agent doesn't care about the body — it picks the tool by matching
   user intent against the description.

## Related topics (pass one as \`topic\` to get a focused slice)

- \`agent-usage\` — how agents auto-discover and call the procedure
- \`code-usage\` — calling via \`runSubFlow(name, input)\` from Code nodes
- \`examples\` — more worked examples (order lookup, convert unit, etc.)
`,

  'agent-usage': `# Procedures in agents

When an Agent node (with \`useMCP: true\`) runs a turn, Circuitry:

1. Walks the workflow looking for Start nodes with a custom \`displayName\`.
2. Emits one tool definition per named Start:
   - tool name: \`proc_<sanitized_displayName>\`
   - description: \`start.data.config.description\`
   - parameters: \`start.data.config.paramsSchema\` (verbatim JSON Schema)
3. Passes the combined tool list to the LLM.
4. When the LLM emits a \`proc_*\` call, dispatches it through
   \`runNamedSubFlow(workflow, name, args)\` which walks the Start node's
   subgraph and returns the tail-node (or Response-node) output.

## Agent config requirements

- \`useMCP: true\` on the agent (driver-mode ChatNode forces this on).
- Global \`settings.mcp.enabled\` must be true (expected for chatflow users).

## The agent prompt

Don't tell the LLM the tool name — it'll see that in the schema. DO tell it
WHEN to call the procedure in terms of user intent:

> "You help customers with order questions. When a user mentions an order
>  number, look it up."

The description on the Procedure + the typed paramsSchema do the rest.
`,

  'code-usage': `# Calling a Procedure from a Code node

Every JavaScript Code node has \`runSubFlow\` injected into its sandbox:

\`\`\`javascript
// Inside a Code node
const order = await runSubFlow('lookup_order', { orderId: 'ABC123' })
return { status: order.status, total: order.total }
\`\`\`

- First arg: the procedure's **displayName** (no \`proc_\` prefix).
- Second arg: the payload passed to the procedure's Start node as input.
- Returns: the procedure's output (tail-node output, or Response node value
  if one lies in the walk).

Python Code nodes do NOT yet have \`runSubFlow\` — use a JS node or call the
procedure through an agent. Python support is deferred.
`,

  examples: `# Procedure examples

## Order lookup

- Start: \`lookup_order\`, paramsSchema \`{ orderId: string (required) }\`
- Code node:
  \`\`\`javascript
  const res = await fetch(\`https://api.example.com/orders/\${input.orderId}\`)
  return res.json()
  \`\`\`

Agent prompt: *"When the user mentions an order number, use the lookup."*
LLM call: \`proc_lookup_order({ orderId: 'ABC123' })\` → returns JSON.

## Convert units

- Start: \`convert_units\`, paramsSchema
  \`{ value: number, from: string, to: string, (all required) }\`
- Code node: performs the conversion.

## Multi-procedure chatflow

A chatflow often has:
- one main ChatNode → Agent pair (the driver)
- several Procedures on the canvas (the agent's toolbox)

The agent picks which to call per turn; the ChatNode transcript shows only
the agent's final reply. Procedures stay out of the user-visible transcript.
`
}

// ============================================================================
// Zod Schema Generation (operates on the ACTIVE, dynamically-loaded catalog)
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
 * Get all ACTIVE tools with their Zod schemas
 */
export function getToolsWithSchemas(): Array<{
  name: string
  description: string
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>
}> {
  return getActiveTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    schema: buildToolSchema(tool)
  }))
}

/**
 * Get an ACTIVE tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return getActiveTools().find(t => t.name === name)
}

/**
 * Get ACTIVE tools grouped by namespace
 */
export function getToolsByNamespace(): Record<string, ToolDefinition[]> {
  const grouped: Record<string, ToolDefinition[]> = {}
  for (const tool of getActiveTools()) {
    if (!grouped[tool.namespace]) {
      grouped[tool.namespace] = []
    }
    grouped[tool.namespace].push(tool)
  }
  return grouped
}
