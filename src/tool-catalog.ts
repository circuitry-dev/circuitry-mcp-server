/**
 * Dynamic tool-catalog lifecycle for the Circuitry MCP server.
 *
 * The active tool list is assembled from the best available source, in priority:
 *   1. live fetch from the connected app (`tools.getDefinitions`)  — freshest
 *   2. on-disk cache of the last successful fetch (~/.circuitry-mcp/…)  — offline
 *   3. the snapshot bundled in the npm tarball (tools-snapshot.json)  — first-run
 *
 * The `circuitry.*` connection tools are owned by this server (they exist only
 * for the MCP transport), so they're prepended here and stripped from every
 * other source to avoid duplication.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'
import type { ToolDefinition } from './types.js'
import { connectionTools } from './tools.js'

const log = (...args: unknown[]) => console.error('[circuitry-mcp:catalog]', ...args)

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
// At runtime this module lives in dist/. The build copies tools-snapshot.json
// next to it, and package.json is one level up.
const SNAPSHOT_PATH = path.join(moduleDir, 'tools-snapshot.json')
const PACKAGE_JSON_PATH = path.join(moduleDir, '..', 'package.json')

const CACHE_DIR = path.join(os.homedir(), '.circuitry-mcp')
const CACHE_PATH = path.join(CACHE_DIR, 'tools-cache.json')

/** The ToolDefinition wire format this server build can parse. */
const SUPPORTED_FORMAT_VERSION = 1

interface SnapshotFile {
  formatVersion: number
  generatedAt?: string
  tools: ToolDefinition[]
}

interface ToolDefinitionsPayload {
  formatVersion: number
  minServerVersion?: string
  appVersion?: string
  tools: ToolDefinition[]
  skillsAvailable?: boolean
}

// Set by a successful refreshFromApp; wins over cache/snapshot for the session.
let fetchedTools: ToolDefinition[] | null = null
// Last computed update-required notice (surfaced by circuitry.connect/status).
let lastUpdateRequired: string | null = null

/** Strip circuitry.* so external sources never duplicate the connection tools. */
function withoutConnectionTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.filter(t => !t.name.startsWith('circuitry.'))
}

/** This package's own version (from package.json), for the version handshake. */
export function getOwnVersion(): string {
  try {
    const raw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8')
    return (JSON.parse(raw) as { version?: string }).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** The update-required notice from the last refresh, or null. */
export function getUpdateRequired(): string | null {
  return lastUpdateRequired
}

/** Read the bundled snapshot (offline/first-run fallback). Never throws. */
export function loadSnapshot(): ToolDefinition[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as SnapshotFile
    return Array.isArray(parsed.tools) ? withoutConnectionTools(parsed.tools) : []
  } catch (err) {
    log('No bundled snapshot available:', err instanceof Error ? err.message : String(err))
    return []
  }
}

/** Read the last successful fetch from disk. Returns null when absent/empty. */
export function loadDiskCache(): ToolDefinition[] | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as SnapshotFile
    if (Array.isArray(parsed.tools) && parsed.tools.length > 0) {
      return withoutConnectionTools(parsed.tools)
    }
  } catch {
    // No cache yet — expected on first run.
  }
  return null
}

/** Persist a fetched catalog to disk. Best-effort; ignores errors. */
export function saveDiskCache(tools: ToolDefinition[]): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const payload: SnapshotFile = {
      formatVersion: SUPPORTED_FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      tools,
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), 'utf-8')
  } catch (err) {
    log('Could not write disk cache (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}

/**
 * The active tool list handed to MCP clients: connection tools first, then the
 * best available catalog (live fetch > disk cache > bundled snapshot).
 */
export function getActiveTools(): ToolDefinition[] {
  const catalog = fetchedTools ?? loadDiskCache() ?? loadSnapshot()
  return [...connectionTools, ...catalog]
}

/**
 * Compare dotted semver-ish versions. Returns 1 if a > b, -1 if a < b, 0 if
 * equal. Prerelease suffixes (e.g. "1.0.0-beta.1") sort below their release.
 */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split('-', 2)
    const nums = core.split('.').map(n => parseInt(n, 10) || 0)
    while (nums.length < 3) nums.push(0)
    return { nums, pre: pre ?? null }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] > pb.nums[i] ? 1 : -1
  }
  // Equal core: a release outranks a prerelease.
  if (pa.pre === pb.pre) return 0
  if (pa.pre === null) return 1
  if (pb.pre === null) return -1
  return pa.pre > pb.pre ? 1 : pa.pre < pb.pre ? -1 : 0
}

/**
 * Fetch the live tool catalog from the connected app and cache it.
 *
 * NEVER throws: on any failure (older app without tools.getDefinitions, app
 * unreachable, malformed payload) the previous in-memory/cache/snapshot list
 * stays in effect silently.
 *
 * Version handshake: if the app advertises a format this build can't parse
 * (formatVersion > supported) OR requires a newer server (minServerVersion >
 * our own version), an update-required notice is produced (and logged to
 * stderr). An unparseable format keeps the fallback list; a parseable format
 * from a "too new for us" minVersion is still adopted (best-effort).
 */
export async function refreshFromApp(
  callApi: (method: string, args?: Record<string, unknown>) => Promise<unknown>
): Promise<{ updated: boolean; updateRequired: string | null }> {
  let payload: ToolDefinitionsPayload
  try {
    payload = (await callApi('tools.getDefinitions', {})) as ToolDefinitionsPayload
  } catch (err) {
    log('tools.getDefinitions unavailable — keeping cached/bundled catalog:',
      err instanceof Error ? err.message : String(err))
    return { updated: false, updateRequired: null }
  }

  if (!payload || !Array.isArray(payload.tools)) {
    log('tools.getDefinitions returned no tools — keeping fallback')
    return { updated: false, updateRequired: null }
  }

  // ---- Version handshake ----------------------------------------------------
  const ownVersion = getOwnVersion()
  const formatTooNew = payload.formatVersion > SUPPORTED_FORMAT_VERSION
  const serverTooOld = payload.minServerVersion
    ? compareVersions(payload.minServerVersion, ownVersion) > 0
    : false

  let updateRequired: string | null = null
  if (formatTooNew || serverTooOld) {
    const min = payload.minServerVersion || `format v${payload.formatVersion}`
    updateRequired =
      `Circuitry app expects MCP server >= ${min} (you have ${ownVersion}). ` +
      `Update: npm i -g @circuitry/mcp-server@latest (or use npx @circuitry/mcp-server).`
    log(updateRequired)
  }
  lastUpdateRequired = updateRequired

  // Can't parse this wire format — surface the notice but keep the fallback.
  if (formatTooNew) {
    return { updated: false, updateRequired }
  }

  const tools = withoutConnectionTools(payload.tools)
  fetchedTools = tools
  saveDiskCache(tools)
  log(`Loaded ${tools.length} tools from app` +
    (payload.appVersion ? ` (app ${payload.appVersion})` : ''))
  return { updated: true, updateRequired }
}
