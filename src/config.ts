/**
 * Configuration management for Circuitry MCP Server
 *
 * Stores config in ~/.circuitry/mcp-config.json
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { MCPConfig } from './types.js'

const CONFIG_DIR = path.join(os.homedir(), '.circuitry')
const CONFIG_PATH = path.join(CONFIG_DIR, 'mcp-config.json')

const DEFAULT_CONFIG: MCPConfig = {
  eserverUrl: 'http://localhost:3030',
  accessKey: '',
  configured: false
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * Load configuration from disk
 */
export function loadConfig(): MCPConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8')
      const config = JSON.parse(content) as Partial<MCPConfig>
      return {
        ...DEFAULT_CONFIG,
        ...config
      }
    }
  } catch (error) {
    // If config is corrupted, return default
    console.error('[config] Error loading config:', error)
  }
  return { ...DEFAULT_CONFIG }
}

/**
 * Save configuration to disk
 */
export function saveConfig(config: MCPConfig): void {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Check if the server is configured with a valid access key
 */
export function isConfigured(): boolean {
  const config = loadConfig()
  return config.configured && config.accessKey.length > 0
}

/**
 * Get the EServer URL from config or environment
 */
export function getEServerUrl(): string {
  // Environment variable takes precedence
  if (process.env.CIRCUITRY_ESERVER_URL) {
    return process.env.CIRCUITRY_ESERVER_URL
  }
  const config = loadConfig()
  return config.eserverUrl
}

/**
 * Get the access key from config or environment
 */
export function getAccessKey(): string {
  // Environment variable takes precedence
  if (process.env.CIRCUITRY_ACCESS_KEY) {
    return process.env.CIRCUITRY_ACCESS_KEY
  }
  const config = loadConfig()
  return config.accessKey
}

/**
 * Clear the configuration (for testing or reset)
 */
export function clearConfig(): void {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH)
  }
}

export { CONFIG_PATH, CONFIG_DIR }
