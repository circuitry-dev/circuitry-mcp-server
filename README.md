# @circuitry/mcp-server

MCP (Model Context Protocol) server that enables Claude Code CLI to communicate with [Circuitry](https://www.circuitry.dev) - a visual workflow and diagramming platform.

## What It Does

- **Visualize Code**: Create code nodes from your project files with bidirectional sync
- **Understand Diagrams**: Claude CLI can comprehend user-drawn flowcharts and diagrams
- **Create Flowcharts**: Ask Claude to create visual flowcharts via Circuitry's chat agent
- **Data Visualization**: Generate spreadsheets and charts from code analysis

## Prerequisites

1. **Circuitry Server** - Download from [circuitry.dev/download](https://www.circuitry.dev/download)
2. **Node.js 18+**
3. **Claude Code CLI**

## Quick Start

### 1. Run Setup

```bash
npx @circuitry/mcp-server setup
```

This will prompt you for:
- **EServer address** - defaults to `http://localhost:3030` (press Enter to accept)
- **Access key** - generated in Circuitry Server

### 2. Generate Access Key

1. Download and launch **Circuitry Server** from [circuitry.dev/download](https://www.circuitry.dev/download)
2. Click the **Circuitry icon** in your system tray
3. Go to **Server → Preferences**
4. Click **"Generate New Access Key"**
5. Copy the key and paste it when prompted by setup

### 3. Configure Claude Code

Add to your Claude Code config (`~/.claude/config.json`):

```json
{
  "mcpServers": {
    "circuitry": {
      "command": "npx",
      "args": ["-y", "@circuitry/mcp-server"]
    }
  }
}
```

### 4. Restart Claude Code

Restart Claude Code to load the MCP server.

## Usage Examples

### Visualize Code Files

```
You: Show me the auth files as code nodes in Circuitry

Claude: I'll create code nodes from your auth files...
Done! Created 4 code nodes for:
- auth/login.ts
- auth/logout.ts
- auth/middleware.ts
- auth/types.ts

The nodes are synced - edits in Circuitry will update your source files.
```

### Understand User-Drawn Flows

```
You: I've drawn a flow of how I think the auth should work

Claude: I'll analyze your flow in Circuitry...

I can see you've drawn a 5-node authentication flow:
1. Start → Login Form
2. Login Form → Validate Credentials
3. Validate Credentials → branches to Success/Failure
...
```

### Create Flowcharts

```
You: Create a flowchart showing the error handling flow

Claude: I'll ask Circuitry's agent to create this flowchart...

Done! Created a flowchart with 7 nodes showing:
- Error detection
- Classification (runtime vs validation)
- Logging paths
- User notification
- Recovery options
```

## Available Tools

### Connection
| Tool | Description |
|------|-------------|
| `circuitry.status` | Check connection status |
| `circuitry.connect` | Request connection (shows permission dialog) |

### Workflow Understanding
| Tool | Description |
|------|-------------|
| `workflow.getActive` | Get current visible workflow info |
| `workflow.getStructure` | Get simplified workflow structure |
| `workflow.resolveFlow` | Resolve user reference ("this flow") to node IDs |
| `workflow.getNodeSummary` | Get simplified node details |

### Node Operations
| Tool | Description |
|------|-------------|
| `nodes.list` | List all nodes in the workflow |
| `nodes.get` | Get a node by ID |
| `nodes.update` | Update node configuration |
| `nodes.delete` | Delete a node |

### Code Nodes
| Tool | Description |
|------|-------------|
| `code.create` | Create code node (from file path with sync, OR with name+content) |
| `code.createBatch` | Create multiple code nodes from files |
| `code.setCode` | Update code content (syncs to source if applicable) |

### Sheet Nodes
| Tool | Description |
|------|-------------|
| `sheet.create` | Create a spreadsheet node with data |
| `sheet.setData` | Replace sheet data |

### Agent Delegation
| Tool | Description |
|------|-------------|
| `agent.chat` | Send message to Circuitry's chat agent |
| `agent.createFlowchart` | Ask agent to create a flowchart |
| `agent.poll` | Poll for agent response (async) |

## Configuration

### Config File

Location: `~/.circuitry/mcp-config.json`

```json
{
  "eserverUrl": "http://localhost:3030",
  "accessKey": "your-key-here",
  "configured": true
}
```

### Environment Variables (Override)

| Variable | Description |
|----------|-------------|
| `CIRCUITRY_ESERVER_URL` | Override EServer URL |
| `CIRCUITRY_ACCESS_KEY` | Override access key |

## Commands

```bash
# Run setup wizard
npx @circuitry/mcp-server setup

# Check current configuration
npx @circuitry/mcp-server status
```

## Troubleshooting

### "Cannot connect to EServer"

1. **Check EServer is running**: Look for the Circuitry icon in your system tray
2. **Start Circuitry Server**: Download from [circuitry.dev/download](https://www.circuitry.dev/download)
3. **Verify URL**: Run `npx @circuitry/mcp-server status`

### "Invalid access key"

1. **Create new key**: Go to Circuitry Server → Preferences → Generate New Access Key
2. **Re-run setup**: `npx @circuitry/mcp-server setup`

### "No Circuitry browser client connected"

1. **Open Circuitry**: Make sure the Circuitry app is open
2. **Refresh**: Try refreshing the Circuitry page

## Development

### Local Development

```bash
# Clone and install
git clone https://github.com/circuitry-dev/circuitry-mcp-server.git
cd circuitry-mcp-server
npm install

# Build
npm run build

# Test locally
npx tsx src/index.ts setup
npx tsx src/index.ts status
```

### Testing with Claude Code

For Claude Code to use your local changes, update config:

```json
{
  "mcpServers": {
    "circuitry": {
      "command": "node",
      "args": ["/path/to/circuitry-mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Code after each rebuild.

## License

MIT

## Links

- [Circuitry Website](https://www.circuitry.dev)
- [Download Circuitry Server](https://www.circuitry.dev/download)
- [Report Issues](https://github.com/circuitry-dev/circuitry-mcp-server/issues)
