/**
 * Interactive setup wizard for Circuitry MCP Server
 *
 * Guides user through configuring access key for EServer connection
 */

import * as readline from 'readline'
import { loadConfig, saveConfig, CONFIG_PATH } from './config.js'
import type { MCPConfig } from './types.js'

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
}

function print(text: string): void {
  process.stdout.write(text)
}

function println(text: string = ''): void {
  console.log(text)
}

function printHeader(): void {
  println()
  println(`${COLORS.cyan}${COLORS.bright}Circuitry MCP Server Setup${COLORS.reset}`)
  println(`${COLORS.dim}${'─'.repeat(40)}${COLORS.reset}`)
  println()
}

function printInstructions(): void {
  println('To connect to Circuitry, you need Circuitry Server running.')
  println()
  println(`${COLORS.bright}Setup steps:${COLORS.reset}`)
  println(`  1. Download Circuitry Server from: ${COLORS.cyan}https://www.circuitry.dev/download${COLORS.reset}`)
  println('  2. Launch Circuitry Server (appears in system tray)')
  println('  3. Go to Server → Preferences → Generate New Access Key')
  println('  4. Copy the key and paste below')
  println()
}

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    if (hidden) {
      // For password-style input, we need to handle it differently
      print(question)
      let input = ''

      process.stdin.setRawMode?.(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')

      const onData = (char: string) => {
        const c = char.toString()
        switch (c) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl+D
            process.stdin.setRawMode?.(false)
            process.stdin.removeListener('data', onData)
            println()
            rl.close()
            resolve(input)
            break
          case '\u0003': // Ctrl+C
            process.exit(1)
            break
          case '\u007F': // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1)
              print('\b \b')
            }
            break
          default:
            input += c
            print('*')
        }
      }

      process.stdin.on('data', onData)
    } else {
      rl.question(question, (answer) => {
        rl.close()
        resolve(answer)
      })
    }
  })
}

async function testConnection(url: string, accessKey: string): Promise<boolean> {
  try {
    print(`\nTesting connection to ${url}...`)

    const response = await fetch(`${url}/ping`, {
      headers: {
        'Authorization': `Bearer ${accessKey}`
      }
    })

    if (response.ok) {
      println(` ${COLORS.green}✓ Connected successfully!${COLORS.reset}`)
      return true
    } else if (response.status === 401) {
      println(` ${COLORS.red}✗ Invalid access key${COLORS.reset}`)
      return false
    } else {
      println(` ${COLORS.red}✗ Server error: ${response.status}${COLORS.reset}`)
      return false
    }
  } catch (error) {
    println(` ${COLORS.red}✗ Connection failed${COLORS.reset}`)
    println(`${COLORS.dim}  Is EServer running? Start Circuitry Electron app first.${COLORS.reset}`)
    return false
  }
}

export async function runSetup(): Promise<void> {
  printHeader()

  // Check existing config
  const existingConfig = loadConfig()
  if (existingConfig.configured) {
    println(`${COLORS.yellow}Note: You already have a configuration.${COLORS.reset}`)
    println(`${COLORS.dim}Config file: ${CONFIG_PATH}${COLORS.reset}`)
    println()

    const overwrite = await prompt('Do you want to reconfigure? (y/N): ')
    if (overwrite.toLowerCase() !== 'y') {
      println('\nSetup cancelled.')
      return
    }
    println()
  }

  printInstructions()

  // Get EServer URL (with prefilled default)
  const defaultUrl = existingConfig.eserverUrl || 'http://localhost:3030'
  const urlInput = await prompt(`EServer address [${COLORS.dim}${defaultUrl}${COLORS.reset}]: `)
  let eserverUrl = urlInput.trim() || defaultUrl

  // Ensure URL has protocol
  if (!eserverUrl.startsWith('http://') && !eserverUrl.startsWith('https://')) {
    eserverUrl = 'http://' + eserverUrl
  }
  // Remove trailing slash
  eserverUrl = eserverUrl.replace(/\/$/, '')

  // Get access key
  const accessKey = await prompt('Access key: ', true)

  if (!accessKey) {
    println(`\n${COLORS.red}Error: Access key is required${COLORS.reset}`)
    process.exit(1)
  }

  // Test connection
  const connected = await testConnection(eserverUrl, accessKey)

  if (!connected) {
    const saveAnyway = await prompt('\nSave configuration anyway? (y/N): ')
    if (saveAnyway.toLowerCase() !== 'y') {
      println('\nSetup cancelled.')
      process.exit(1)
    }
  }

  // Save config
  const config: MCPConfig = {
    eserverUrl,
    accessKey,
    configured: true
  }
  saveConfig(config)

  println()
  println(`${COLORS.green}Configuration saved to ${CONFIG_PATH}${COLORS.reset}`)
  println()
  println(`${COLORS.bright}Next steps:${COLORS.reset}`)
  println('  Add this to your Claude Code config (~/.claude/config.json):')
  println()
  println(`${COLORS.dim}  {`)
  println(`    "mcpServers": {`)
  println(`      "circuitry": {`)
  println(`        "command": "npx",`)
  println(`        "args": ["-y", "@circuitry/mcp-server"]`)
  println(`      }`)
  println(`    }`)
  println(`  }${COLORS.reset}`)
  println()
}

/**
 * Show current configuration status
 */
export function showStatus(): void {
  const config = loadConfig()

  println()
  println(`${COLORS.cyan}${COLORS.bright}Circuitry MCP Server Status${COLORS.reset}`)
  println(`${COLORS.dim}${'─'.repeat(40)}${COLORS.reset}`)
  println()
  println(`Configured: ${config.configured ? `${COLORS.green}Yes${COLORS.reset}` : `${COLORS.red}No${COLORS.reset}`}`)
  println(`EServer URL: ${config.eserverUrl}`)
  println(`Access Key: ${config.accessKey ? '****' + config.accessKey.slice(-4) : '(not set)'}`)
  println(`Config File: ${CONFIG_PATH}`)
  println()
}
