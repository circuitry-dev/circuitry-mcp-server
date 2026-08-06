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
import { PROCEDURE_AUTHORING_GUIDE } from './tools.js'
import { getActiveTools, refreshFromApp, getUpdateRequired, getOwnVersion } from './tool-catalog.js'

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
      version: getOwnVersion()
    },
    {
      capabilities: {
        // listChanged: we re-fetch the live tool catalog on connect and notify
        // the client if it differs from the bundled snapshot (dynamic discovery).
        tools: { listChanged: true }
      }
    }
  )

  // Get EServer client
  const client = getClient()

  // Re-fetch the live tool catalog from the app and notify the client if it
  // changed. Never throws (refreshFromApp swallows failures). Returns the
  // update-required notice, if any, to append to connect/status output.
  const refreshCatalog = async (): Promise<string | null> => {
    const { updated, updateRequired } = await refreshFromApp(
      (method, args) => client.callApi(method, args)
    )
    if (updated) {
      try {
        await server.sendToolListChanged()
      } catch (err) {
        log('sendToolListChanged failed (non-fatal):', err instanceof Error ? err.message : String(err))
      }
    }
    return updateRequired
  }

  const appendNotice = (message: string, notice: string | null): string =>
    notice ? `${message}\n\n${notice}` : message

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('Received list_tools request')

    const tools = getActiveTools().map(tool => {
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
    const toolStart = performance.now()
    const { name, arguments: args } = request.params
    const argsSize = JSON.stringify(args || {}).length
    log(`Received call_tool request: ${name} (args: ${argsSize} bytes)`)

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
        const updateRequired = getUpdateRequired()
        // Report the HOST's view, not just this process's flag — a session
        // approved before this server started is approved, and reporting
        // `false` sends the model chasing a permission problem that isn't one.
        if (!connectionApproved && (await client.getConnectionStatus()).approved) {
          connectionApproved = true
        }
        return successResponse({
          ...status,
          approved: connectionApproved,
          ...(updateRequired ? { updateRequired } : {})
        })
      }

      // Handle circuitry.connect - request permission
      if (name === 'circuitry.connect') {
        if (connectionApproved) {
          const updateRequired = await refreshCatalog()
          return successResponse({
            approved: true,
            message: appendNotice('Already connected and approved', updateRequired)
          })
        }

        // Request connection permission from Circuitry
        const result = await client.requestConnection()
        connectionApproved = result.approved

        // On approval, pull the live tool catalog so newly-added app tools show
        // up without an MCP release, and notify the client of the change.
        const updateRequired = result.approved ? await refreshCatalog() : null

        return successResponse({
          approved: result.approved,
          message: appendNotice(
            result.approved
              ? 'Connection approved. Chat panel opened in agent+mcp mode.'
              : 'Connection denied by user.',
            updateRequired
          )
        })
      }

      // Handle circuitry.disconnect - end session
      if (name === 'circuitry.disconnect') {
        const result = await client.disconnect()
        connectionApproved = false
        return successResponse({
          disconnected: result.success,
          message: result.message || 'Session disconnected. Call circuitry.connect to reconnect.'
        })
      }

      // All other tools require an approved connection — but "not connected
      // yet" is NOT an error the model should have to recover from. Telling it
      // to "call circuitry.connect first" costs a full round-trip to do a thing
      // that needs no judgement, and for a chat-spawned server the host
      // auto-approves anyway, so the user never even sees a prompt: it is pure
      // latency for a handshake we can just perform. CONNECT, THEN CONTINUE.
      if (!connectionApproved) {
        // Already approved in a previous session? (cheap, no user-facing effect)
        const status = await client.getConnectionStatus()
        if (status.authFailed) {
          return errorResponse(
            `Circuitry rejected the access key (401).\n\nThis is an AUTHENTICATION problem, not a permission one — do not retry circuitry.connect, it will fail the same way.\n\nAsk the user to re-run:\n  npx @circuitry/mcp-server setup`
          )
        }
        if (status.approved) {
          connectionApproved = true
          // Reconnect path — refresh the catalog too so it tracks the app.
          await refreshCatalog()
        } else {
          // Perform the handshake on the model's behalf. Terminal-launched CLIs
          // still get a real consent dialog here (the host broadcasts
          // mcp_connection_request); only an actual DENIAL is an error.
          log(`Auto-connecting for "${name}" (no approved session yet)`)
          const result = await client.requestConnection()
          if (result.approved) {
            connectionApproved = true
            await refreshCatalog()
          } else {
            return errorResponse(
              `Connection to Circuitry was not approved.\n\n${result.message || 'The user declined the connection request.'}\n\nAsk the user to approve the Circuitry connection, then retry.`
            )
          }
        }
      }

      // Agent delegation tools REMOVED - 2026-01-18
      // With MCP/Agent Chat tool parity, Claude uses MCP tools directly
      // (nodes.createFlowchart, workflow.resolveFlow, etc.)
      // instead of delegating to the browser agent.

      // Procedure authoring guide — returned inline so it works even when
      // Circuitry isn't connected. Keep in sync with circuitry-api's
      // PROCEDURE_AUTHORING_GUIDE and docs/procedures.md.
      if (name === 'procedure.getAuthoringGuide') {
        const { topic } = args as { topic?: 'overview' | 'agent-usage' | 'code-usage' | 'examples' }
        const guide = PROCEDURE_AUTHORING_GUIDE[topic || 'overview'] || PROCEDURE_AUTHORING_GUIDE.overview
        return successResponse({ guide })
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
        const { userMessage, selectedNodeId } = args as { userMessage: string; selectedNodeId?: string }
        const result = await client.callApi('mcp.resolveFlow', { userMessage, selectedNodeId })
        return successResponse(result)
      }

      if (name === 'workflow.getNodeSummary') {
        const { nodeIds } = args as { nodeIds?: string[] }
        const result = await client.callApi('mcp.getNodeSummary', { nodeIds: nodeIds || [] })
        return successResponse(result)
      }

      if (name === 'workflow.getFlowcharts') {
        const result = await client.callApi('mcp.getFlowcharts', {})
        return successResponse(result)
      }

      if (name === 'workflow.layoutNodes') {
        const { nodeIds, direction, spacing } = args as {
          nodeIds?: string[]
          direction?: 'vertical' | 'horizontal'
          spacing?: number
        }
        const result = await client.callApi('mcp.layoutNodes', { nodeIds, direction, spacing })
        return successResponse(result)
      }

      if (name === 'workflow.undo') {
        const result = await client.callApi('mcp.undo', {})
        return successResponse(result)
      }

      if (name === 'workflow.redo') {
        const result = await client.callApi('mcp.redo', {})
        return successResponse(result)
      }

      if (name === 'workflow.canUndo') {
        const result = await client.callApi('mcp.canUndo', {})
        return successResponse(result)
      }

      if (name === 'workflow.canRedo') {
        const result = await client.callApi('mcp.canRedo', {})
        return successResponse(result)
      }

      if (name === 'workflow.getSelectionContext') {
        const result = await client.callApi('mcp.getSelectionContext', {})
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

      if (name === 'code.createBatchGrouped') {
        const { groups, layout } = args as {
          groups: Array<{
            name: string
            files: Array<{ path: string; name?: string }>
            color?: string
          }>
          layout?: string
        }
        const result = await client.createCodeNodesGrouped(groups, layout)
        return successResponse(result)
      }

      // Handle html.create with file-based params
      if (name === 'html.create') {
        const { htmlFile, cssFile, html, css, ...restArgs } = args as {
          htmlFile?: string
          cssFile?: string
          html?: string
          css?: string
          [key: string]: unknown
        }

        let finalHtml = html
        let finalCss = css

        // Read HTML from file if provided
        if (htmlFile) {
          try {
            const fs = await import('fs/promises')
            finalHtml = await fs.readFile(htmlFile, 'utf-8')
            log(`[html.create] Read HTML from file: ${htmlFile} (${finalHtml.length} chars)`)
          } catch (err) {
            return errorResponse(`Failed to read HTML file: ${htmlFile} - ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        // Read CSS from file if provided
        if (cssFile) {
          try {
            const fs = await import('fs/promises')
            finalCss = await fs.readFile(cssFile, 'utf-8')
            log(`[html.create] Read CSS from file: ${cssFile} (${finalCss.length} chars)`)
          } catch (err) {
            return errorResponse(`Failed to read CSS file: ${cssFile} - ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        // Validate we have HTML and CSS
        if (!finalHtml) {
          return errorResponse('html.create requires either "html" or "htmlFile" parameter')
        }
        if (!finalCss) {
          return errorResponse('html.create requires either "css" or "cssFile" parameter')
        }

        // Call API with resolved content
        const result = await client.callApi('html.create', {
          ...restArgs,
          html: finalHtml,
          css: finalCss
        })
        const toolElapsed = performance.now() - toolStart
        log(`[TIMING] Tool ${name} (file-based) completed in ${toolElapsed.toFixed(0)}ms`)
        return successResponse(result)
      }

      // For all other tools, relay to Circuitry API
      // The EServer bridge passes args as an object to the Circuitry API
      // API methods support both direct args: nodes.get("id") and object args: nodes.get({ nodeId: "id" })
      const result = await client.callApi(name, args as Record<string, unknown>)
      const toolElapsed = performance.now() - toolStart
      log(`[TIMING] Tool ${name} completed in ${toolElapsed.toFixed(0)}ms`)

      // Generic image passthrough: any tool result carrying a data:image/* URI
      // (drawing.getImage, screen.capture, doc.screenshot, …) is returned as a
      // viewable MCP image so vision models can see it.
      const imageContent = toImageContent(result)
      if (imageContent) return imageContent

      return successResponse(result)

    } catch (error) {
      const toolElapsed = performance.now() - toolStart
      const errorMessage = error instanceof Error ? error.message : String(error)
      log(`Tool error: ${errorMessage}`)
      log(`[TIMING] Tool ${name} failed in ${toolElapsed.toFixed(0)}ms`)
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
    client.disconnectWebSocket()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    log('Shutting down...')
    client.disconnectWebSocket()
    process.exit(0)
  })
}

/**
 * If a tool result carries a `data:image/*;base64,` URI in `imageData`, return
 * it as a viewable MCP image (plus a text sidecar with the rest of the result).
 * Returns null when there's no such image, so the caller falls through to the
 * normal JSON text response.
 */
function toImageContent(result: unknown) {
  if (!result || typeof result !== 'object') return null
  const imageData = (result as { imageData?: unknown }).imageData
  if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) return null

  const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s)
  if (!match) return null
  const [, mimeType, base64Data] = match

  return {
    content: [
      { type: 'image' as const, data: base64Data, mimeType },
      {
        type: 'text' as const,
        text: JSON.stringify({ ...(result as Record<string, unknown>), imageData: '<returned as image>' }, null, 2)
      }
    ]
  }
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
