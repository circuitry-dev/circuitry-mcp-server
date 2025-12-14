/**
 * EServer Client v2
 *
 * HTTP and WebSocket client for communicating with Circuitry's EServer.
 * Includes connection permission flow, agent delegation, and file operations.
 */

import WebSocket from 'ws'
import { getEServerUrl, getAccessKey } from './config.js'
import type {
  CircuitryApiRequest,
  CircuitryApiResponse,
  CircuitryPrompt,
  EServerStatus,
  WSMessage
} from './types.js'

// Use console.error for logging since stdout is reserved for MCP JSON-RPC
const log = (...args: unknown[]) => console.error('[eserver-client]', ...args)

export interface ConnectionResult {
  approved: boolean
  message?: string
}

export interface AgentChatResult {
  chatId: string
  status: 'pending' | 'completed' | 'error'
}

export interface AgentPollResult {
  status: 'pending' | 'completed' | 'error'
  response?: string
  createdNodes?: string[]
  error?: string
}

export interface FileReadResult {
  content: string
  checksum: string
  lastModified: number
}

export class EServerClient {
  private baseUrl: string
  private accessKey: string
  private ws: WebSocket | null = null
  private wsConnected = false
  private pendingRequests = new Map<string, {
    resolve: (response: CircuitryApiResponse) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  private promptHandlers: ((prompt: CircuitryPrompt) => void)[] = []
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(url?: string, accessKey?: string) {
    this.baseUrl = url || getEServerUrl()
    this.accessKey = accessKey || getAccessKey()
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessKey}`,
      'Content-Type': 'application/json'
    }
  }

  /**
   * Check if EServer is running and accessible
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/ping`, {
        headers: this.getHeaders()
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get EServer status
   */
  async getStatus(): Promise<EServerStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        headers: this.getHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        return {
          running: true,
          version: data.version,
          uptime: data.uptime,
          circuitryConnected: data.circuitryConnected
        }
      }
    } catch (error) {
      log('Status check failed:', error)
    }
    return { running: false }
  }

  // ============================================================================
  // Connection Permission Flow
  // ============================================================================

  /**
   * Request connection permission from Circuitry user
   * Shows a dialog in Circuitry for user to approve/deny
   */
  async requestConnection(): Promise<ConnectionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/connect`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          source: 'claude-code-cli',
          timestamp: Date.now()
        })
      })

      if (response.ok) {
        const data = await response.json()
        return {
          approved: data.approved,
          message: data.message
        }
      } else {
        const error = await response.text()
        return {
          approved: false,
          message: `Connection request failed: ${error}`
        }
      }
    } catch (error) {
      log('Connection request failed:', error)
      return {
        approved: false,
        message: error instanceof Error ? error.message : 'Connection failed'
      }
    }
  }

  /**
   * Check if connection is already approved
   */
  async getConnectionStatus(): Promise<{ approved: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/status`, {
        headers: this.getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        return { approved: data.approved || false }
      }
    } catch (error) {
      log('Connection status check failed:', error)
    }
    return { approved: false }
  }

  // ============================================================================
  // Agent Delegation
  // ============================================================================

  /**
   * Send a message to Circuitry's chat agent
   * Opens chat panel in agent+mcp mode
   */
  async sendAgentChat(message: string, context?: Record<string, unknown>): Promise<AgentChatResult> {
    try {
      const response = await fetch(`${this.baseUrl}/agent/chat`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          message,
          context,
          mode: 'agent+mcp'
        })
      })

      if (response.ok) {
        const data = await response.json()
        return {
          chatId: data.chatId,
          status: data.status || 'pending'
        }
      } else {
        const error = await response.text()
        throw new Error(`Agent chat failed: ${error}`)
      }
    } catch (error) {
      log('Agent chat failed:', error)
      throw error
    }
  }

  /**
   * Poll for agent response
   */
  async pollAgentResponse(chatId: string): Promise<AgentPollResult> {
    try {
      const response = await fetch(`${this.baseUrl}/agent/poll/${chatId}`, {
        headers: this.getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        return {
          status: data.status,
          response: data.response,
          createdNodes: data.createdNodes,
          error: data.error
        }
      } else {
        return {
          status: 'error',
          error: `Poll failed: ${response.status}`
        }
      }
    } catch (error) {
      log('Agent poll failed:', error)
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Poll failed'
      }
    }
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Create a code node from a file path
   * EServer reads the file and creates the node with sync metadata
   */
  async createCodeNodeFromFile(
    filePath: string,
    name?: string,
    position?: { x: number; y: number }
  ): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/files/create-code-node`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          filePath,
          name,
          position
        })
      })

      if (response.ok) {
        const data = await response.json()
        return data.nodeId
      } else {
        const error = await response.text()
        throw new Error(`Failed to create code node: ${error}`)
      }
    } catch (error) {
      log('Create code node failed:', error)
      throw error
    }
  }

  /**
   * Create multiple code nodes from file paths
   */
  async createCodeNodesFromFiles(
    filePaths: string[],
    layout?: string
  ): Promise<{ nodeIds: string[]; errors: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/files/create-code-nodes-batch`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          filePaths,
          layout: layout || 'grid'
        })
      })

      if (response.ok) {
        return await response.json()
      } else {
        const error = await response.text()
        throw new Error(`Failed to create code nodes: ${error}`)
      }
    } catch (error) {
      log('Create code nodes batch failed:', error)
      throw error
    }
  }

  /**
   * Read a file from the local filesystem via EServer
   */
  async readFile(filePath: string): Promise<FileReadResult> {
    try {
      const response = await fetch(`${this.baseUrl}/files/read`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ filePath })
      })

      if (response.ok) {
        return await response.json()
      } else {
        const error = await response.text()
        throw new Error(`Failed to read file: ${error}`)
      }
    } catch (error) {
      log('Read file failed:', error)
      throw error
    }
  }

  /**
   * Write content back to a file
   */
  async writeFile(filePath: string, content: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/files/write-back`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ filePath, content })
      })

      return response.ok
    } catch (error) {
      log('Write file failed:', error)
      return false
    }
  }

  // ============================================================================
  // Circuitry API (existing)
  // ============================================================================

  /**
   * Call a Circuitry API method via EServer
   */
  async callApi(method: string, args: Record<string, unknown> = {}): Promise<unknown> {
    // If WebSocket is connected, use it for faster communication
    if (this.wsConnected && this.ws) {
      return this.callApiViaWs(method, args)
    }

    // Otherwise use HTTP
    return this.callApiViaHttp(method, args)
  }

  /**
   * Call API via HTTP POST
   */
  private async callApiViaHttp(method: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/circuitry/api`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ method, args })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API call failed: ${response.status} - ${error}`)
    }

    const result = await response.json() as CircuitryApiResponse
    if (!result.success) {
      throw new Error(result.error || 'Unknown error')
    }

    return result.result
  }

  /**
   * Call API via WebSocket for lower latency
   */
  private callApiViaWs(method: string, args: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('API call timeout'))
      }, 30000)

      this.pendingRequests.set(requestId, {
        resolve: (response) => {
          if (response.success) {
            resolve(response.result)
          } else {
            reject(new Error(response.error || 'Unknown error'))
          }
        },
        reject,
        timeout
      })

      const request: CircuitryApiRequest = {
        method,
        args,
        requestId
      }

      const message: WSMessage = {
        type: 'api_request',
        payload: request,
        timestamp: Date.now()
      }

      this.ws?.send(JSON.stringify(message))
    })
  }

  /**
   * Get pending prompts from Circuitry
   */
  async getPrompts(): Promise<CircuitryPrompt[]> {
    try {
      const response = await fetch(`${this.baseUrl}/circuitry/prompts`, {
        headers: this.getHeaders()
      })

      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      log('Failed to get prompts:', error)
    }
    return []
  }

  /**
   * Respond to a prompt from Circuitry
   */
  async respondToPrompt(promptId: string, response: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/circuitry/prompts/${promptId}/respond`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ response })
    })

    if (!res.ok) {
      throw new Error(`Failed to respond to prompt: ${res.status}`)
    }
  }

  /**
   * Connect to EServer WebSocket for real-time communication
   */
  async connectWebSocket(): Promise<void> {
    if (this.ws && this.wsConnected) {
      return
    }

    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/circuitry/realtime'

      log('Connecting to WebSocket:', wsUrl)

      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessKey}`
        }
      })

      this.ws.on('open', () => {
        log('WebSocket connected')
        this.wsConnected = true
        this.reconnectAttempts = 0
        resolve()
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage
          this.handleWsMessage(message)
        } catch (error) {
          log('Failed to parse WebSocket message:', error)
        }
      })

      this.ws.on('close', () => {
        log('WebSocket disconnected')
        this.wsConnected = false
        this.ws = null
        this.attemptReconnect()
      })

      this.ws.on('error', (error) => {
        log('WebSocket error:', error.message)
        if (!this.wsConnected) {
          reject(error)
        }
      })
    })
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWsMessage(message: WSMessage): void {
    switch (message.type) {
      case 'api_response': {
        const response = message.payload as CircuitryApiResponse
        const pending = this.pendingRequests.get(response.requestId)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(response.requestId)
          pending.resolve(response)
        }
        break
      }

      case 'prompt': {
        const prompt = message.payload as CircuitryPrompt
        for (const handler of this.promptHandlers) {
          handler(prompt)
        }
        break
      }

      case 'ping': {
        this.ws?.send(JSON.stringify({
          type: 'pong',
          payload: null,
          timestamp: Date.now()
        }))
        break
      }
    }
  }

  /**
   * Attempt to reconnect WebSocket
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log('Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.connectWebSocket().catch((error) => {
        log('Reconnect failed:', error.message)
      })
    }, delay)
  }

  /**
   * Register a handler for prompts from Circuitry
   */
  onPrompt(handler: (prompt: CircuitryPrompt) => void): void {
    this.promptHandlers.push(handler)
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.maxReconnectAttempts = 0 // Prevent reconnection
    this.ws?.close()
    this.ws = null
    this.wsConnected = false
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.wsConnected
  }
}

// Singleton instance
let client: EServerClient | null = null

export function getClient(): EServerClient {
  if (!client) {
    client = new EServerClient()
  }
  return client
}
