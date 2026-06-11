# Research Notes

Date: 2026-06-10

## Official CLI Behavior

Proton's June 9, 2026 announcement says the Proton Drive CLI is available for Windows, macOS, and Linux, is built on the Proton Drive SDK, and supports listing, uploading, downloading, trash, sharing, and invitations. It also documents `--json` / `-j` for machine-friendly output and browser-based sign-in.

The Proton support article documents:

- `./proton-drive auth login`
- `./proton-drive filesystem list /my-files`
- `./proton-drive filesystem upload ~/Documents/* /my-files/Documents`
- `./proton-drive filesystem download /my-files/Documents ./`
- `./proton-drive sharing invite --user person@example.com /my-files/Documents`

The official CLI README adds:

- Development builds use Bun.
- `auth login` stores the session in the OS secret store.
- `PROTON_DRIVE_CACHE_DIR` controls cache, app data, and logs.
- Default Windows paths include `%LOCALAPPDATA%\proton-drive-cli\Cache`, `Data`, and `Logs`.

## Verification Findings

- An early manually installed CLI reported:

```text
Proton Drive CLI cli-drive@0.0.3+d34e4d1
Proton Drive SDK js@0.0.0+d34e4d1
```

- Later managed installer verification downloaded Proton's live `windows/x64` release from `https://proton.me/download/drive/cli/index.html`.
- Managed CLI version:

```text
Proton Drive CLI cli-drive@0.4.3+6a83701
Proton Drive SDK js@0.0.0+6a83701
```

- Logged-in status was verified by listing `/my-files` with JSON output. The command returned an empty JSON array, consistent with an empty Drive root.

## MCP SDK

The current TypeScript SDK pattern uses:

- `McpServer` from `@modelcontextprotocol/server`
- `StdioServerTransport` from `@modelcontextprotocol/server/stdio`
- `server.registerTool(...)`
- `zod/v4` schemas
