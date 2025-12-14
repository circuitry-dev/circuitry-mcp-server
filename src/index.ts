#!/usr/bin/env node
/**
 * Circuitry MCP Server CLI
 *
 * Entry point for the @circuitry/mcp-server package.
 * Routes to setup wizard or starts the MCP server.
 */

import { runSetup, showStatus } from './setup.js'
import { startServer } from './server.js'

const HELP_TEXT = `
Circuitry MCP Server
────────────────────

A Model Context Protocol server for Claude Code to communicate with Circuitry.

Usage:
  circuitry-mcp              Start the MCP server (default)
  circuitry-mcp setup        Configure access key for EServer
  circuitry-mcp status       Show current configuration
  circuitry-mcp help         Show this help message

Environment Variables:
  CIRCUITRY_ESERVER_URL      Override EServer URL (default: http://localhost:3030)
  CIRCUITRY_ACCESS_KEY       Override access key from config

Claude Code Configuration:
  Add this to ~/.claude/config.json:

  {
    "mcpServers": {
      "circuitry": {
        "command": "npx",
        "args": ["-y", "@circuitry/mcp-server"]
      }
    }
  }

Documentation:
  https://github.com/your-org/circuitry/docs/circuitry-mcp-server.md
`

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]?.toLowerCase()

  switch (command) {
    case 'setup':
      await runSetup()
      break

    case 'status':
      showStatus()
      break

    case 'help':
    case '--help':
    case '-h':
      console.log(HELP_TEXT)
      break

    case 'version':
    case '--version':
    case '-v':
      console.log('1.0.0')
      break

    default:
      // No command or unknown command - start the server
      // When started by Claude Code, there will be no command
      await startServer()
      break
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
