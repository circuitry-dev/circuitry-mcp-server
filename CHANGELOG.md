# Changelog

All notable changes to `@circuitry/mcp-server` are documented here.

## 2.1.0

Dynamic tool discovery — the server no longer needs a release when Circuitry
adds tools.

- **Dynamic tool discovery.** On a successful `circuitry.connect`, the server
  fetches the app's live tool catalog over the existing relay
  (`tools.getDefinitions`) and advertises it to your AI client, emitting an MCP
  `tools/list_changed` notification when the list changes. New tools in Circuitry
  now appear without updating this package.
- **Resilient fallback.** The active tool list resolves live fetch → on-disk
  cache (`~/.circuitry-mcp/tools-cache.json`) → bundled snapshot
  (`tools-snapshot.json`, shipped in the tarball). Works fully offline; an older
  app without `tools.getDefinitions` degrades silently to the fallback.
- **Version handshake.** If the app requires a newer server than you have, the
  server keeps working with whatever it can parse and surfaces an update-required
  notice on `circuitry.connect` / `circuitry.status`.
- **Generalized image results.** Any tool result carrying a `data:image/*` URI
  (e.g. `drawing.getImage`, `screen.capture`, `doc.screenshot`) is now returned
  as a viewable MCP image — no per-tool special-casing.
- **Version hygiene.** The package version jumps from 1.0.1 to 2.1.0 to align
  with the version the server already advertised (2.0.0) and the app's minimum
  supported server version (2.1.0). The self-reported MCP server version is now
  read from `package.json` (single source of truth).
- The hand-mirrored ~2k-line tool catalog is removed; parity with the app is now
  automatic (no manual sync step).
