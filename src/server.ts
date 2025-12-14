/**
 * Circuitry MCP Server v2
 *
 * Lightweight bridge to Circuitry with permission flow and agent delegation.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { isConfigured, getAccessKey, getEServerUrl } from './config.js'
import { getClient } from './eserver-client.js'
import { allToolDefinitions } from './tools.js'

// Use console.error for logging since stdout is reserved for MCP JSON-RPC
const log = (...args: unknown[]) => console.error('[circuitry-mcp]', ...args)

// Connection state
let connectionApproved = false

/**
 * Create and start the MCP server
 */
export async function startServer(): Promise<void> {
  log('Starting Circuitry MCP Server v2...')

  // Check configuration
  if (!isConfigured()) {
    log('Server not configured. Run "npx @circuitry/mcp-server setup" first.')
  }

  // Create server
  const server = new Server(
    {
      name: 'circuitry-mcp-server',
      version: '2.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  // Get EServer client
  const client = getClient()

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('Received list_tools request')

    const tools = allToolDefinitions.map(tool => {
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const param of tool.parameters) {
        const prop: Record<string, unknown> = {
          description: param.description
        }

        switch (param.type) {
          case 'string':
            prop.type = 'string'
            if (param.enum) {
              prop.enum = param.enum
            }
            break
          case 'number':
            prop.type = 'number'
            break
          case 'boolean':
            prop.type = 'boolean'
            break
          case 'array':
            prop.type = 'array'
            prop.items = param.items || { type: 'string' }
            break
          case 'object':
            prop.type = 'object'
            prop.additionalProperties = true
            break
          default:
            prop.type = 'string'
        }

        properties[param.name] = prop

        if (param.required) {
          required.push(param.name)
        }
      }

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object' as const,
          properties,
          required
        }
      }
    })

    return { tools }
  })

  // Handle call_tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    log(`Received call_tool request: ${name}`)

    // Check if configured
    if (!isConfigured()) {
      return errorResponse(
        'Circuitry MCP Server is not configured.\n\nRun this command to set up:\n  npx @circuitry/mcp-server setup'
      )
    }

    // Check connection to EServer
    const connected = await client.ping()
    if (!connected) {
      return errorResponse(
        `Cannot connect to EServer at ${getEServerUrl()}\n\nMake sure:\n1. Circuitry Electron app is running\n2. EServer is enabled (check system tray)`
      )
    }

    try {
      // Handle circuitry.status - always allowed
      if (name === 'circuitry.status') {
        const status = await client.getStatus()
        return successResponse({
          ...status,
          approved: connectionApproved
        })
      }

      // Handle circuitry.connect - request permission
      if (name === 'circuitry.connect') {
        if (connectionApproved) {
          return successResponse({
            approved: true,
            message: 'Already connected and approved'
          })
        }

        // Request connection permission from Circuitry
        const result = await client.requestConnection()
        connectionApproved = result.approved

        return successResponse({
          approved: result.approved,
          message: result.approved
            ? 'Connection approved. Chat panel opened in agent+mcp mode.'
            : 'Connection denied by user.'
        })
      }

      // All other tools require approved connection
      if (!connectionApproved) {
        // Try to auto-approve if already approved in a previous session
        const status = await client.getConnectionStatus()
        if (status.approved) {
          connectionApproved = true
        } else {
          return errorResponse(
            'Connection not approved.\n\nCall circuitry.connect first to request permission from the user.'
          )
        }
      }

      // Handle agent delegation tools
      if (name === 'agent.chat') {
        const { message, context } = args as { message: string; context?: Record<string, unknown> }
        const result = await client.sendAgentChat(message, context)
        return successResponse(result)
      }

      if (name === 'agent.createFlowchart') {
        const { description, style } = args as { description: string; style?: string }
        const message = style
          ? `Create a ${style} flowchart: ${description}`
          : `Create a flowchart: ${description}`
        const result = await client.sendAgentChat(message, { intent: 'flowchart', style })
        return successResponse(result)
      }

      if (name === 'agent.poll') {
        const { chatId } = args as { chatId: string }
        const result = await client.pollAgentResponse(chatId)
        return successResponse(result)
      }

      // Handle workflow tools via Circuitry MCP API
      if (name === 'workflow.getActive') {
        // Get full workflow structure which includes workflow info
        const result = await client.callApi('mcp.getWorkflowStructure', {})
        const structure = result as { workflowId: string | null; workflowName: string | null; nodeCount: number; edgeCount: number }
        return successResponse({
          id: structure.workflowId,
          name: structure.workflowName,
          nodeCount: structure.nodeCount,
          edgeCount: structure.edgeCount
        })
      }

      if (name === 'workflow.getStructure') {
        const result = await client.callApi('mcp.getWorkflowStructure', {})
        return successResponse(result)
      }

      if (name === 'workflow.resolveFlow') {
        const { userMessage } = args as { userMessage: string }
        const result = await client.callApi('mcp.resolveFlow', { userMessage })
        return successResponse(result)
      }

      if (name === 'workflow.getNodeSummary') {
        const { nodeIds } = args as { nodeIds?: string[] }
        const result = await client.callApi('mcp.getNodeSummary', { nodeIds: nodeIds || [] })
        return successResponse(result)
      }

      // Handle code tools - can use file path OR direct content
      if (name === 'code.create') {
        const { filePath, name: nodeName, content, position } = args as {
          filePath?: string
          name?: string
          content?: string
          position?: { x: number; y: number }
        }

        // If filePath provided, use file sync feature
        if (filePath) {
          const result = await client.createCodeNodeFromFile(filePath, nodeName, position)
          return successResponse(result)
        }

        // Otherwise use direct API (name + content)
        const result = await client.callApi('code.create', { name: nodeName, content, position })
        return successResponse(result)
      }

      if (name === 'code.createBatch') {
        const { filePaths, layout } = args as { filePaths: string[]; layout?: string }
        const result = await client.createCodeNodesFromFiles(filePaths, layout)
        return successResponse(result)
      }

      // For all other tools, relay to Circuitry API
      // The EServer bridge passes args as an object to the Circuitry API
      // API methods support both direct args: nodes.get("id") and object args: nodes.get({ nodeId: "id" })
      const result = await client.callApi(name, args as Record<string, unknown>)
      return successResponse(result)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log(`Tool error: ${errorMessage}`)
      return errorResponse(errorMessage)
    }
  })

  // Connect to stdio transport
  const transport = new StdioServerTransport()

  log('Connecting to stdio transport...')
  await server.connect(transport)

  log('Server started successfully')

  // Keep the process running
  process.on('SIGINT', () => {
    log('Shutting down...')
    client.disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    log('Shutting down...')
    client.disconnect()
    process.exit(0)
  })
}

/**
 * Create a success response
 */
function successResponse(data: unknown) {
  let text: string
  if (data === undefined || data === null) {
    text = 'Success (no return value)'
  } else if (typeof data === 'object') {
    text = JSON.stringify(data, null, 2)
  } else {
    text = String(data)
  }

  return {
    content: [{ type: 'text', text }]
  }
}

/**
 * Create an error response
 */
function errorResponse(message: string) {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true
  }
}
