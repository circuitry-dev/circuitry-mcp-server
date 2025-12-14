/**
 * Circuitry MCP Server Types
 */

export interface MCPConfig {
  eserverUrl: string
  accessKey: string
  configured: boolean
}

export interface EServerStatus {
  running: boolean
  version?: string
  uptime?: number
  circuitryConnected?: boolean
}

export interface CircuitryPrompt {
  id: string
  question: string
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface CircuitryApiRequest {
  method: string
  args: Record<string, unknown>
  requestId: string
}

export interface CircuitryApiResponse {
  requestId: string
  success: boolean
  result?: unknown
  error?: string
}

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any'
  description: string
  required: boolean
  enum?: string[]
  items?: { type: string }
  properties?: Record<string, { type: string; description: string }>
}

export interface ToolDefinition {
  name: string
  namespace: string
  description: string
  parameters: ToolParameter[]
  returns: {
    type: string
    description: string
  }
  example?: string
}

// WebSocket message types
export type WSMessageType =
  | 'api_request'
  | 'api_response'
  | 'prompt'
  | 'prompt_response'
  | 'status'
  | 'ping'
  | 'pong'

export interface WSMessage {
  type: WSMessageType
  payload: unknown
  timestamp: number
}
