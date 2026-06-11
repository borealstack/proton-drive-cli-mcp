# Development

This project is Node-first for public users and Bun-tested for development. The published package is `@borealstack/proton-drive-cli-mcp` and its binary is `proton-drive-cli-mcp`; Bun remains the preferred local package manager and test runner.

## Setup

```powershell
bun install
```

## Checks

```powershell
npm run typecheck
npm run build
npm test
bun run test:bun
```

Leave `PROTON_DRIVE_CLI_PATH` unset to exercise managed CLI discovery and auto-install behavior. Set it only when you need to test a specific binary.

## Design Notes

- All Proton operations go through `src/cli.ts`.
- `src/server.ts` only registers MCP tools and schemas.
- Unit tests mock the CLI runner and do not touch Proton Drive.
- `test/mcp-stdio.node-check.mjs` verifies the built MCP stdio server starts under Node.js.
